"use strict";
cc._RF.push(module, '07a29YiH+9OOriSfiAzFcqR', 'WsSessionMgr');
// scripts/WsSessionMgr.js

"use strict";

window.sendSafely = function (msgStr) {
  /**
  * - "If the data can't be sent (for example, because it needs to be buffered but the buffer is full), the socket is closed automatically."
  *
  * from https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send.
  */
  if (null == window.clientSession || window.clientSession.readyState != WebSocket.OPEN) return false;
  window.clientSession.send(msgStr);
};

window.closeWSConnection = function () {
  if (null == window.clientSession || window.clientSession.readyState != WebSocket.OPEN) return;
  cc.log("Closing \"window.clientSession\" from the client-side.");
  window.clientSession.close();
};

window.getBoundRoomIdFromPersistentStorage = function () {
  return cc.sys.localStorage.boundRoomId;
};

window.clearBoundRoomIdInBothVolatileAndPersistentStorage = function () {
  window.boundRoomId = null;
  cc.sys.localStorage.removeItem("boundRoomId");
};

window.boundRoomId = getBoundRoomIdFromPersistentStorage();
window.handleHbRequirements = function (resp) {
  if (constants.RET_CODE.OK != resp.ret) return;
  if (null == window.boundRoomId) {
    window.boundRoomId = resp.data.boundRoomId;
    cc.sys.localStorage.boundRoomId = window.boundRoomId;
  }

  window.clientSessionPingInterval = setInterval(function () {
    if (clientSession.readyState != WebSocket.OPEN) return;
    var param = {
      msgId: Date.now(),
      act: "HeartbeatPing",
      data: {
        clientTimestamp: Date.now()
      }
    };
    window.sendSafely(JSON.stringify(param));
  }, resp.data.intervalToPing);
};

window.handleHbPong = function (resp) {
  if (constants.RET_CODE.OK != resp.ret) return;
  // TBD.
};

window.initPersistentSessionClient = function (onopenCb) {
  if (window.clientSession && window.clientSession.readyState == WebSocket.OPEN) {
    if (null == onopenCb) return;
    onopenCb();
    return;
  }

  var intAuthToken = cc.sys.localStorage.selfPlayer ? JSON.parse(cc.sys.localStorage.selfPlayer).intAuthToken : "";

  var urlToConnect = backendAddress.PROTOCOL.replace('http', 'ws') + '://' + backendAddress.HOST + ":" + backendAddress.PORT + backendAddress.WS_PATH_PREFIX + "?intAuthToken=" + intAuthToken;

  window.boundRoomId = getBoundRoomIdFromPersistentStorage();
  if (null != window.boundRoomId) {
    urlToConnect = urlToConnect + "&boundRoomId=" + window.boundRoomId;
  }
  var clientSession = new WebSocket(urlToConnect);

  clientSession.onopen = function (event) {
    cc.log("The WS clientSession is opened.");
    window.clientSession = clientSession;
    if (null == onopenCb) return;
    onopenCb();
  };

  clientSession.onmessage = function (event) {
    var resp = JSON.parse(event.data);
    switch (resp.act) {
      case "HeartbeatRequirements":
        window.handleHbRequirements(resp);
        break;
      case "HeartbeatPong":
        window.handleHbPong(resp);
        break;
      case "RoomDownsyncFrame":
        if (window.handleRoomDownsyncFrame) {
          window.handleRoomDownsyncFrame(resp.data);
        }
        break;
      default:
        cc.log("" + JSON.stringify(resp));
        break;
    }
  };

  clientSession.onerror = function (event) {
    cc.error("Error caught on the WS clientSession:", event);
    if (window.clientSessionPingInterval) {
      clearInterval(clientSessionPingInterval);
    }
    if (window.handleClientSessionCloseOrError) {
      window.handleClientSessionCloseOrError();
    }
  };

  clientSession.onclose = function (event) {
    cc.log("The WS clientSession is closed:", event);
    if (!event.wasClean) {
      // Chrome doesn't allow the use of "CustomCloseCode"s (yet) and will callback with a "WebsocketStdCloseCode 1006" and "false == event.wasClean" here. See https://tools.ietf.org/html/rfc6455#section-7.4 for more information.
      window.clearBoundRoomIdInBothVolatileAndPersistentStorage();
    }
    switch (event.code) {
      case constants.RET_CODE.LOCALLY_NO_SPECIFIED_ROOM:
      case constants.RET_CODE.PLAYER_NOT_ADDABLE_TO_ROOM:
      case constants.RET_CODE.PLAYER_NOT_READDABLE_TO_ROOM:
      case constants.RET_CODE.PLAYER_NOT_FOUND:
      case constants.RET_CODE.PLAYER_CHEATING:
        window.clearBoundRoomIdInBothVolatileAndPersistentStorage();
        break;
      default:
        break;
    }
    if (window.clientSessionPingInterval) {
      clearInterval(clientSessionPingInterval);
    }
    if (window.handleClientSessionCloseOrError) {
      window.handleClientSessionCloseOrError();
    }
  };
};

cc._RF.pop();