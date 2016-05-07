'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var EventEmitter = require('events');
var fs = require('fs');
var Request = require('./request.js');
var debug = require('debug')('wechat');
var FormData = require('form-data');
var mime = require('mime');

var updateAPI = require('./utils').updateAPI;
var CONF = require('./utils').CONF;
var convertEmoji = require('./utils').convertEmoji;
var contentPrase = require('./utils').contentPrase;

// Private
var PROP = Symbol();
var API = Symbol();

var Wechat = function (_EventEmitter) {
  _inherits(Wechat, _EventEmitter);

  function Wechat() {
    _classCallCheck(this, Wechat);

    var _this = _possibleConstructorReturn(this, Object.getPrototypeOf(Wechat).call(this));

    _this[PROP] = {
      uuid: '',
      uin: '',
      sid: '',
      skey: '',
      passTicket: '',
      formateSyncKey: '',
      webwxDataTicket: '',
      deviceId: 'e' + Math.random().toString().substring(2, 17),

      baseRequest: {},
      syncKey: {}
    };

    _this[API] = {
      jsLogin: 'https://login.weixin.qq.com/jslogin',
      login: 'https://login.weixin.qq.com/cgi-bin/mmwebwx-bin/login'
    };

    _this.syncErrorCount = 0;
    _this.mediaSend = 0;
    _this.state = CONF.STATE.init;

    _this.user = []; // 登陆账号
    _this.memberList = []; // 所有联系人

    _this.contactList = []; // 个人联系人
    _this.groupList = []; // 已保存群聊
    _this.groupMemberList = []; // 所有群聊内联系人
    _this.publicList = []; // 公众账号
    _this.specialList = []; // 特殊账号

    _this.request = new Request();
    return _this;
  }

  _createClass(Wechat, [{
    key: 'setProp',
    value: function setProp(key, val) {
      this[PROP][key] = val;
    }
  }, {
    key: 'getProp',
    value: function getProp(key) {
      return this[PROP][key];
    }

    // 通讯录好友

  }, {
    key: 'getUUID',
    value: function getUUID() {
      var _this2 = this;

      var params = {
        'appid': 'wx782c26e4c19acffb',
        'fun': 'new',
        'lang': 'zh_CN'
      };
      return this.request({
        method: 'POST',
        url: this[API].jsLogin,
        params: params
      }).then(function (res) {
        var pm = res.data.match(/window.QRLogin.code = (\d+); window.QRLogin.uuid = "(\S+?)"/);
        if (!pm) {
          throw new Error('UUID错误: 格式错误');
        }
        var code = +pm[1];
        var uuid = _this2[PROP].uuid = pm[2];

        if (code !== 200) {
          throw new Error('UUID错误: ' + code);
        }

        _this2.emit('uuid', uuid);
        _this2.state = CONF.STATE.uuid;

        return uuid;
      }).catch(function (err) {
        debug(err);
        throw new Error('获取UUID失败');
      });
    }
  }, {
    key: 'checkScan',
    value: function checkScan() {
      var _this3 = this;

      debug('CheckScan');
      var params = {
        'tip': 1,
        'uuid': this[PROP].uuid
      };
      return this.request({
        method: 'GET',
        url: this[API].login,
        params: params
      }).then(function (res) {
        var pm = res.data.match(/window.code=(\d+);/);
        var code = +pm[1];

        if (code !== 201) {
          throw new Error('扫描状态code错误: ' + code);
        }

        _this3.emit('scan');
      }).catch(function (err) {
        debug(err);
        throw new Error('获取扫描状态信息失败');
      });
    }
  }, {
    key: 'checkLogin',
    value: function checkLogin() {
      var _this4 = this;

      var params = {
        'tip': 0,
        'uuid': this[PROP].uuid
      };
      return this.request({
        method: 'GET',
        url: this[API].login,
        params: params
      }).then(function (res) {
        var pm = res.data.match(/window.code=(\d+);/);
        var code = pm[1];

        if (code !== '200') {
          throw new Error('登陆确认code错误: ' + code);
        }

        pm = res.data.match(/window.redirect_uri="(\S+?)";/);
        _this4[API].rediUri = pm[1] + '&fun=new';
        _this4[API].baseUri = _this4[API].rediUri.substring(0, _this4[API].rediUri.lastIndexOf('/'));

        // 接口更新
        updateAPI(_this4[API]);

        _this4.emit('confirm');
      }).catch(function (err) {
        debug(err);
        throw new Error('获取确认登录信息失败');
      });
    }
  }, {
    key: 'login',
    value: function login() {
      var _this5 = this;

      return this.request({
        method: 'GET',
        url: this[API].rediUri
      }).then(function (res) {
        _this5[PROP].skey = res.data.match(/<skey>(.*)<\/skey>/)[1];
        _this5[PROP].sid = res.data.match(/<wxsid>(.*)<\/wxsid>/)[1];
        _this5[PROP].uin = res.data.match(/<wxuin>(.*)<\/wxuin>/)[1];
        _this5[PROP].passTicket = res.data.match(/<pass_ticket>(.*)<\/pass_ticket>/)[1];
        if (res.headers['set-cookie']) {
          res.headers['set-cookie'].forEach(function (item) {
            if (item.indexOf('webwxDataTicket') !== -1) {
              _this5[PROP].webwxDataTicket = item.split('; ').shift().split('=').pop();
            }
          });
        }
        _this5[PROP].baseRequest = {
          'Uin': parseInt(_this5[PROP].uin, 10),
          'Sid': _this5[PROP].sid,
          'Skey': _this5[PROP].skey,
          'DeviceID': _this5[PROP].deviceId
        };
      }).catch(function (err) {
        debug(err);
        throw new Error('登录失败');
      });
    }
  }, {
    key: 'init',
    value: function init() {
      var _this6 = this;

      var params = {
        'pass_ticket': this[PROP].passTicket,
        'skey': this[PROP].skey,
        'r': +new Date()
      };
      var data = {
        BaseRequest: this[PROP].baseRequest
      };
      return this.request({
        method: 'POST',
        url: this[API].webwxinit,
        params: params,
        data: data
      }).then(function (res) {
        var data = res.data;
        _this6.user = data['User'];

        _this6._updateSyncKey(data['SyncKey']);

        if (data['BaseResponse']['Ret'] !== 0) {
          throw new Error('微信初始化Ret错误' + data['BaseResponse']['Ret']);
        }
      }).catch(function (err) {
        debug(err);
        throw new Error('微信初始化失败');
      });
    }
  }, {
    key: 'notifyMobile',
    value: function notifyMobile() {
      var data = {
        'BaseRequest': this[PROP].baseRequest,
        'Code': 3,
        'FromUserName': this.user['UserName'],
        'ToUserName': this.user['UserName'],
        'ClientMsgId': +new Date()
      };
      return this.request({
        method: 'POST',
        url: this[API].webwxstatusnotify,
        data: data
      }).then(function (res) {
        var data = res.data;
        if (data['BaseResponse']['Ret'] !== 0) {
          throw new Error('开启状态通知Ret错误' + data['BaseResponse']['Ret']);
        }
      }).catch(function (err) {
        debug(err);
        throw new Error('开启状态通知失败');
      });
    }
  }, {
    key: 'getContact',
    value: function getContact() {
      var _this7 = this;

      var params = {
        'lang': 'zh_CN',
        'pass_ticket': this[PROP].passTicket,
        'seq': 0,
        'skey': this[PROP].skey,
        'r': +new Date()
      };
      return this.request({
        method: 'POST',
        url: this[API].webwxgetcontact,
        params: params
      }).then(function (res) {
        var data = res.data;
        _this7.memberList = data['MemberList'];

        if (_this7.memberList.length === 0) {
          throw new Error('通讯录获取异常');
        }

        _this7.state = CONF.STATE.login;
        _this7.emit('login', _this7.memberList);

        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = _this7.memberList[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var member = _step.value;

            member['NickName'] = convertEmoji(member['NickName']);
            member['RemarkName'] = convertEmoji(member['RemarkName']);

            if (member['VerifyFlag'] & 8) {
              _this7.publicList.push(member);
            } else if (CONF.SPECIALUSERS.indexOf(member['UserName']) > -1) {
              _this7.specialList.push(member);
            } else if (member['UserName'].indexOf('@@') > -1) {
              _this7.groupList.push(member);
            } else {
              _this7.contactList.push(member);
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }

        debug('好友数量：' + _this7.memberList.length);
        return _this7.memberList;
      }).catch(function (err) {
        debug(err);
        throw new Error('获取通讯录失败');
      });
    }
  }, {
    key: 'batchGetContact',
    value: function batchGetContact() {
      var _this8 = this;

      var params = {
        'pass_ticket': this[PROP].passTicket,
        'type': 'e',
        'r': +new Date()
      };
      var data = {
        'BaseRequest': this[PROP].baseRequest,
        'Count': this.groupList.length,
        'List': this.groupList.map(function (member) {
          return {
            'UserName': member['UserName'],
            'EncryChatRoomId': ''
          };
        })
      };
      return this.request({
        method: 'POST',
        url: this[API].webwxbatchgetcontact,
        params: params,
        data: data
      }).then(function (res) {
        var data = res.data;
        var contactList = data['ContactList'];

        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
          for (var _iterator2 = contactList[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
            var group = _step2.value;
            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {
              for (var _iterator3 = group['MemberList'][Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                var member = _step3.value;

                _this8.groupMemberList.push(member);
              }
            } catch (err) {
              _didIteratorError3 = true;
              _iteratorError3 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion3 && _iterator3.return) {
                  _iterator3.return();
                }
              } finally {
                if (_didIteratorError3) {
                  throw _iteratorError3;
                }
              }
            }
          }
        } catch (err) {
          _didIteratorError2 = true;
          _iteratorError2 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion2 && _iterator2.return) {
              _iterator2.return();
            }
          } finally {
            if (_didIteratorError2) {
              throw _iteratorError2;
            }
          }
        }

        debug('群组好友总数：', _this8.groupMemberList.length);
        return _this8.groupMemberList;
      }).catch(function (err) {
        debug(err);
        throw new Error('获取群组通讯录失败');
      });
    }
  }, {
    key: 'syncPolling',
    value: function syncPolling() {
      var _this9 = this;

      this._syncCheck().then(function (state) {
        if (state.retcode !== CONF.SYNCCHECK_RET_SUCCESS) {
          throw new Error('你登出了微信');
        } else {
          if (state.selector !== CONF.SYNCCHECK_SELECTOR_NORMAL) {
            return _this9._sync().then(function (data) {
              setTimeout(function () {
                _this9.syncPolling();
              }, 1000);
              _this9._handleMsg(data);
            });
          } else {
            debug('WebSync Normal');
            setTimeout(function () {
              _this9.syncPolling();
            }, 1000);
          }
        }
      }).catch(function (err) {
        if (++_this9.syncErrorCount > 3) {
          debug(err);
          _this9.emit('error', err);
          _this9.logout();
        } else {
          setTimeout(function () {
            _this9.syncPolling();
          }, 1000);
        }
      });
    }
  }, {
    key: 'logout',
    value: function logout() {
      var _this10 = this;

      var params = {
        redirect: 1,
        type: 0,
        skey: this[PROP].skey
      };

      // data加上会出错，不加data也能登出
      // let data = {
      //   sid: this[PROP].sid,
      //   uin: this[PROP].uin
      // }
      return this.request({
        method: 'POST',
        url: this[API].webwxlogout,
        params: params
      }).then(function (res) {
        _this10.state = CONF.STATE.logout;
        _this10.emit('logout');
        return '登出成功';
      }).catch(function (err) {
        debug(err);
        _this10.state = CONF.STATE.logout;
        _this10.emit('logout');
        throw new Error('可能登出成功');
      });
    }
  }, {
    key: 'start',
    value: function start() {
      var _this11 = this;

      return Promise.resolve(this.state === CONF.STATE.uuid ? 0 : this.getUUID()).then(function () {
        return _this11.checkScan();
      }).then(function () {
        return _this11.checkLogin();
      }).then(function () {
        return _this11.login();
      }).then(function () {
        return _this11.init();
      }).then(function () {
        return _this11.notifyMobile();
      }).then(function () {
        return _this11.getContact();
      }).then(function () {
        return _this11.batchGetContact();
      }).then(function () {
        if (_this11.state !== CONF.STATE.login) {
          throw new Error('登陆失败，未进入SyncPolling');
        }
        return _this11.syncPolling();
      }).catch(function (err) {
        debug('启动失败', err);
        _this11.stop();
        throw new Error('启动失败');
      });
    }
  }, {
    key: 'stop',
    value: function stop() {
      return this.logout();
    }
  }, {
    key: 'sendMsg',
    value: function sendMsg(msg, to) {
      var params = {
        'pass_ticket': this[PROP].passTicket
      };
      var clientMsgId = +new Date() + '0' + Math.random().toString().substring(2, 5);
      var data = {
        'BaseRequest': this[PROP].baseRequest,
        'Msg': {
          'Type': 1,
          'Content': msg,
          'FromUserName': this.user['UserName'],
          'ToUserName': to,
          'LocalID': clientMsgId,
          'ClientMsgId': clientMsgId
        }
      };
      this.request({
        method: 'POST',
        url: this[API].webwxsendmsg,
        params: params,
        data: data
      }).then(function (res) {
        var data = res.data;
        if (data['BaseResponse']['Ret'] !== 0) {
          throw new Error('发送信息Ret错误: ' + data['BaseResponse']['Ret']);
        }
      }).catch(function (err) {
        debug(err);
        throw new Error('发送信息失败');
      });
    }
  }, {
    key: 'sendImage',
    value: function sendImage(to, file, type, size) {
      var _this12 = this;

      return this._uploadMedia(file, type, size).then(function (mediaId) {
        return _this12._sendImage(mediaId, to);
      }).catch(function (err) {
        debug(err);
        throw new Error('发送图片信息失败');
      });
    }
  }, {
    key: '_syncCheck',
    value: function _syncCheck() {
      var params = {
        'r': +new Date(),
        'sid': this[PROP].sid,
        'uin': this[PROP].uin,
        'skey': this[PROP].skey,
        'deviceid': this[PROP].deviceId,
        'synckey': this[PROP].formateSyncKey
      };
      return this.request({
        method: 'GET',
        url: this[API].synccheck,
        params: params
      }).then(function (res) {
        var re = /window.synccheck={retcode:"(\d+)",selector:"(\d+)"}/;
        var pm = res.data.match(re);

        var retcode = +pm[1];
        var selector = +pm[2];

        return {
          retcode: retcode, selector: selector
        };
      }).catch(function (err) {
        debug(err);
        throw new Error('同步失败');
      });
    }
  }, {
    key: '_sync',
    value: function _sync() {
      var _this13 = this;

      var params = {
        'sid': this[PROP].sid,
        'skey': this[PROP].skey,
        'pass_ticket': this[PROP].passTicket
      };
      var data = {
        'BaseRequest': this[PROP].baseRequest,
        'SyncKey': this[PROP].syncKey,
        'rr': ~new Date()
      };
      return this.request({
        method: 'POST',
        url: this[API].webwxsync,
        params: params,
        data: data
      }).then(function (res) {
        var data = res.data;
        if (data['BaseResponse']['Ret'] !== 0) {
          throw new Error('拉取消息Ret错误: ' + data['BaseResponse']['Ret']);
        }

        _this13._updateSyncKey(data['SyncKey']);
        return data;
      }).catch(function (err) {
        debug(err);
        throw new Error('获取新信息失败');
      });
    }
  }, {
    key: '_handleMsg',
    value: function _handleMsg(data) {
      var _this14 = this;

      debug('Receive ', data['AddMsgList'].length, 'Message');

      data['AddMsgList'].forEach(function (msg) {
        var type = +msg['MsgType'];
        var fromUser = _this14._getUserRemarkName(msg['FromUserName']);
        var content = contentPrase(msg['Content']);

        switch (type) {
          case CONF.MSGTYPE_STATUSNOTIFY:
            debug(' Message: Init');
            _this14.emit('init-message');
            break;
          case CONF.MSGTYPE_TEXT:
            debug(' Text-Message: ', fromUser, ': ', content);
            _this14.emit('text-message', msg);
            break;
          case CONF.MSGTYPE_IMAGE:
            debug(' Image-Message: ', fromUser, ': ', content);
            _this14._getMsgImg(msg.MsgId).then(function (image) {
              msg.Content = image;
              _this14.emit('image-message', msg);
            });
            break;
          case CONF.MSGTYPE_VOICE:
            debug(' Voice-Message: ', fromUser, ': ', content);
            _this14._getVoice(msg.MsgId).then(function (voice) {
              msg.Content = voice;
              _this14.emit('voice-message', msg);
            });
            break;
          case CONF.MSGTYPE_EMOTICON:
            debug(' Emoticon-Message: ', fromUser, ': ', content);
            _this14._getEmoticon(content).then(function (emoticon) {
              msg.Content = emoticon;
              _this14.emit('emoticon-message', msg);
            });
            break;
          case CONF.MSGTYPE_VERIFYMSG:
            debug(' Message: Add Friend');
            _this14.emit('verify-message', msg);
            break;
        }
      });
    }

    // file: Buffer, Stream, File, Blob

  }, {
    key: '_uploadMedia',
    value: function _uploadMedia(file, type, size) {
      type = type || file.type || (file.path ? mime.lookup(file.path) : null) || '';
      size = size || file.size || (file.path ? fs.statSync(file.path).size : null) || file.length || 0;

      var mediaId = this.mediaSend++;
      var clientMsgId = +new Date() + '0' + Math.random().toString().substring(2, 5);

      var uploadMediaRequest = JSON.stringify({
        BaseRequest: this[PROP].baseRequest,
        ClientMediaId: clientMsgId,
        TotalLen: size,
        StartPos: 0,
        DataLen: size,
        MediaType: 4
      });

      var form = new FormData();
      form.append('id', 'WU_FILE_' + mediaId);
      form.append('name', 'filename');
      form.append('type', type);
      form.append('lastModifieDate', new Date().toGMTString());
      form.append('size', size);
      form.append('mediatype', 'pic');
      form.append('uploadmediarequest', uploadMediaRequest);
      form.append('webwx_data_ticket', this[PROP].webwxDataTicket);
      form.append('pass_ticket', encodeURI(this[PROP].passTicket));
      form.append('filename', file, {
        filename: 'filename',
        contentType: type,
        knownLength: size
      });

      var params = {
        f: 'json'
      };

      return this.request({
        url: this[API].webwxuploadmedia,
        method: 'POST',
        params: params,
        data: form
      }).then(function (res) {
        var mediaId = res.data.MediaId;
        if (!mediaId) {
          throw new Error('MediaId获取失败');
        }
        return mediaId;
      }).catch(function (err) {
        debug(err);
        throw new Error('上传图片失败');
      });
    }
  }, {
    key: '_sendImage',
    value: function _sendImage(mediaId, to) {
      var params = {
        'pass_ticket': this[PROP].passTicket,
        'fun': 'async',
        'f': 'json'
      };
      var clientMsgId = +new Date() + '0' + Math.random().toString().substring(2, 5);
      var data = {
        'BaseRequest': this[PROP].baseRequest,
        'Msg': {
          'Type': 3,
          'MediaId': mediaId,
          'FromUserName': this.user['UserName'],
          'ToUserName': to,
          'LocalID': clientMsgId,
          'ClientMsgId': clientMsgId
        }
      };
      return this.request({
        method: 'POST',
        url: this[API].webwxsendmsgimg,
        params: params,
        data: data
      }).then(function (res) {
        var data = res.data;
        if (data['BaseResponse']['Ret'] !== 0) {
          throw new Error('发送图片信息Ret错误: ' + data['BaseResponse']['Ret']);
        }
      }).catch(function (err) {
        debug(err);
        throw new Error('发送图片失败');
      });
    }
  }, {
    key: '_getMsgImg',
    value: function _getMsgImg(msgId) {
      var params = {
        MsgID: msgId,
        skey: this[PROP].skey
      };

      return this.request({
        method: 'GET',
        url: this[API].webwxgetmsgimg,
        params: params,
        responseType: 'arraybuffer'
      }).then(function (res) {
        return {
          data: res.data,
          type: res.headers['content-type']
        };
      }).catch(function (err) {
        debug(err);
        throw new Error('获取图片失败');
      });
    }
  }, {
    key: '_getVoice',
    value: function _getVoice(msgId) {
      var params = {
        MsgID: msgId,
        skey: this[PROP].skey
      };

      return this.request({
        method: 'GET',
        url: this[API].webwxgetvoice,
        params: params,
        responseType: 'arraybuffer'
      }).then(function (res) {
        return {
          data: res.data,
          type: res.headers['content-type']
        };
      }).catch(function (err) {
        debug(err);
        throw new Error('获取声音失败');
      });
    }
  }, {
    key: '_getEmoticon',
    value: function _getEmoticon(content) {
      var _this15 = this;

      return Promise.resolve().then(function () {
        return _this15.request({
          method: 'GET',
          url: content.match(/cdnurl="(.*?)"/)[1],
          responseType: 'arraybuffer'
        });
      }).then(function (res) {
        return {
          data: res.data,
          type: res.headers['content-type'],
          url: res.config.url
        };
      }).catch(function (err) {
        debug(err);
        throw new Error('获取表情失败');
      });
    }
  }, {
    key: '_getHeadImg',
    value: function _getHeadImg(member) {
      var url = this[API].baseUri.match(/http.*?\/\/.*?(?=\/)/)[0] + member.HeadImgUrl;
      return this.request({
        method: 'GET',
        url: url,
        responseType: 'arraybuffer'
      }).then(function (res) {
        var headImg = {
          data: res.data,
          type: res.headers['content-type']
        };
        member.HeadImg = headImg;
        return headImg;
      }).catch(function (err) {
        debug(err);
        throw new Error('获取头像失败');
      });
    }
  }, {
    key: '_getUserRemarkName',
    value: function _getUserRemarkName(uid) {
      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = this.memberList[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var member = _step4.value;

          if (member['UserName'] === uid) {
            return member['RemarkName'] ? member['RemarkName'] : member['NickName'];
          }
        }
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4.return) {
            _iterator4.return();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }

      debug('不存在用户', uid);
      return uid;
    }
  }, {
    key: '_updateSyncKey',
    value: function _updateSyncKey(syncKey) {
      this[PROP].syncKey = syncKey;
      var synckeylist = [];
      for (var e = this[PROP].syncKey['List'], o = 0, n = e.length; n > o; o++) {
        synckeylist.push(e[o]['Key'] + '_' + e[o]['Val']);
      }
      this[PROP].formateSyncKey = synckeylist.join('|');
    }
  }, {
    key: 'friendList',
    get: function get() {
      var _this16 = this;

      var members = [];

      this.groupList.forEach(function (member) {
        members.push({
          username: member['UserName'],
          nickname: '群聊: ' + member['NickName'],
          py: member['RemarkPYQuanPin'] ? member['RemarkPYQuanPin'] : member['PYQuanPin'],
          avatar: _this16[API].baseUri.match(/http.*?\/\/.*?(?=\/)/)[0] + member.HeadImgUrl
        });
      });

      this.contactList.forEach(function (member) {
        members.push({
          username: member['UserName'],
          nickname: member['RemarkName'] ? member['RemarkName'] : member['NickName'],
          py: member['RemarkPYQuanPin'] ? member['RemarkPYQuanPin'] : member['PYQuanPin'],
          avatar: _this16[API].baseUri.match(/http.*?\/\/.*?(?=\/)/)[0] + member.HeadImgUrl
        });
      });

      return members;
    }
  }]);

  return Wechat;
}(EventEmitter);

Wechat.STATE = CONF.STATE;

exports = module.exports = Wechat;
//# sourceMappingURL=wechat.js.map