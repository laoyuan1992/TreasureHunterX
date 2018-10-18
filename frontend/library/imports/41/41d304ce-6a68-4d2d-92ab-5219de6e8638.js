"use strict";
cc._RF.push(module, '41d30TOamhNLZKrUhneboY4', 'Map');
// scripts/Map.js

"use strict";

var i18n = require('LanguageData');
i18n.init(window.language); // languageID should be equal to the one we input in New Language ID input field

window.ALL_MAP_STATES = {
  VISUAL: 0, // For free dragging & zooming.
  EDITING_BELONGING: 1,
  SHOWING_MODAL_POPUP: 2
};

window.ALL_BATTLE_STATES = {
  WAITING: 0,
  IN_BATTLE: 1,
  IN_SETTLEMENT: 2,
  IN_DISMISSAL: 3
};

cc.Class({
  extends: cc.Component,

  properties: {
    canvasNode: {
      type: cc.Node,
      default: null
    },
    tiledAnimPrefab: {
      type: cc.Prefab,
      default: null
    },
    selfPlayerPrefab: {
      type: cc.Prefab,
      default: null
    },
    npcPlayerPrefab: {
      type: cc.Prefab,
      default: null
    },
    type2NpcPlayerPrefab: {
      type: cc.Prefab,
      default: null
    },
    barrierPrefab: {
      type: cc.Prefab,
      default: null
    },
    shelterPrefab: {
      type: cc.Prefab,
      default: null
    },
    shelterZReducerPrefab: {
      type: cc.Prefab,
      default: null
    },
    keyboardInputControllerNode: {
      type: cc.Node,
      default: null
    },
    joystickInputControllerNode: {
      type: cc.Node,
      default: null
    },
    confirmLogoutPrefab: {
      type: cc.Prefab,
      default: null
    },
    simplePressToGoDialogPrefab: {
      type: cc.Prefab,
      default: null
    },
    selfPlayerIdLabel: {
      type: cc.Label,
      default: null
    },
    boundRoomIdLabel: {
      type: cc.Label,
      default: null
    },
    countdownLabel: {
      type: cc.Label,
      default: null
    }
  },

  _onPerUpsyncFrame: function _onPerUpsyncFrame() {
    var instance = this;
    if (null == instance.selfPlayerId || null == instance.selfPlayerScriptIns || null == instance.selfPlayerScriptIns.scheduledDirection) return;
    var upsyncFrameData = {
      id: instance.selfPlayerId,
      dir: {
        dx: parseFloat(instance.selfPlayerScriptIns.scheduledDirection.dx),
        dy: parseFloat(instance.selfPlayerScriptIns.scheduledDirection.dy)
      },
      x: parseFloat(instance.selfPlayerNode.x),
      y: parseFloat(instance.selfPlayerNode.y)
    };
    var wrapped = {
      msgId: Date.now(),
      act: "PlayerUpsyncCmd",
      data: upsyncFrameData
    };
    window.sendSafely(JSON.stringify(wrapped));
  },


  // LIFE-CYCLE CALLBACKS:
  onDestroy: function onDestroy() {
    var self = this;
    if (self.upsyncLoopInterval) {
      clearInterval(self.upsyncLoopInterval);
    }
    if (self.inputControlTimer) {
      clearInterval(self.inputControlTimer);
    }
  },
  popupSimplePressToGo: function popupSimplePressToGo(labelString) {
    var self = this;
    if (ALL_MAP_STATES.VISUAL != self.state) {
      return;
    }
    self.state = ALL_MAP_STATES.SHOWING_MODAL_POPUP;

    var canvasNode = self.canvasNode;
    var simplePressToGoDialogNode = cc.instantiate(self.simplePressToGoDialogPrefab);
    simplePressToGoDialogNode.setPosition(cc.v2(0, 0));
    simplePressToGoDialogNode.setScale(1 / canvasNode.getScale());
    var simplePressToGoDialogScriptIns = simplePressToGoDialogNode.getComponent("SimplePressToGoDialog");
    var yesButton = simplePressToGoDialogNode.getChildByName("Yes");
    var postDismissalByYes = function postDismissalByYes() {
      self.transitToState(ALL_MAP_STATES.VISUAL);
      canvasNode.removeChild(simplePressToGoDialogNode);
    };
    simplePressToGoDialogNode.getChildByName("Hint").getComponent(cc.Label).string = labelString;
    yesButton.once("click", simplePressToGoDialogScriptIns.dismissDialog.bind(simplePressToGoDialogScriptIns, postDismissalByYes));
    yesButton.getChildByName("Label").getComponent(cc.Label).string = "OK";
    self.transitToState(ALL_MAP_STATES.SHOWING_MODAL_POPUP);
    simplePressToGoDialogNode.setScale(1 / canvasNode.getScale());
    safelyAddChild(canvasNode, simplePressToGoDialogNode);
  },
  alertForGoingBackToLoginScene: function alertForGoingBackToLoginScene(labelString, mapIns, shouldRetainBoundRoomIdInBothVolatileAndPersistentStorage) {
    var millisToGo = 3000;
    mapIns.popupSimplePressToGo(cc.js.formatStr("%s Will logout in %s seconds.", labelString, millisToGo / 1000));
    setTimeout(function () {
      mapIns.logout(false, shouldRetainBoundRoomIdInBothVolatileAndPersistentStorage);
    }, millisToGo);
  },
  onLoad: function onLoad() {
    var _this = this;

    var self = this;
    self.lastRoomDownsyncFrameId = 0;

    self.selfPlayerNode = null;
    self.selfPlayerScriptIns = null;
    self.selfPlayerId = null;

    var mapNode = self.node;
    var canvasNode = mapNode.parent;
    cc.director.getCollisionManager().enabled = true;
    cc.director.getCollisionManager().enabledDebugDraw = CC_DEBUG;

    self.battleState = ALL_BATTLE_STATES.WAITING;
    self.otherPlayerNodeDict = {};
    self.otherPlayerCachedDataDict = {};
    self.confirmLogoutNode = cc.instantiate(self.confirmLogoutPrefab);
    self.confirmLogoutNode.getComponent("ConfirmLogout").mapNode = self.node;
    self.confirmLogoutNode.width = canvasNode.width;
    self.confirmLogoutNode.height = canvasNode.height;

    self.clientUpsyncFps = 15;
    self.upsyncLoopInterval = null;

    window.handleClientSessionCloseOrError = function () {
      self.alertForGoingBackToLoginScene("Client session closed unexpectedly!", self, true);
    };

    initPersistentSessionClient(function () {
      self.state = ALL_MAP_STATES.VISUAL;
      var tiledMapIns = self.node.getComponent(cc.TiledMap);
      var selfPlayerInfo = JSON.parse(cc.sys.localStorage.selfPlayer);
      self.spawnSelfPlayer(selfPlayerInfo);
      _this._inputControlEnabled = true;
      self.setupInputControls();

      var boundaryObjs = tileCollisionManager.extractBoundaryObjects(self.node);
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = boundaryObjs.frameAnimations[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var frameAnim = _step.value;

          var animNode = cc.instantiate(self.tiledAnimPrefab);
          var anim = animNode.getComponent(cc.Animation);
          animNode.setPosition(frameAnim.posInMapNode);
          animNode.width = frameAnim.sizeInMapNode.width;
          animNode.height = frameAnim.sizeInMapNode.height;
          animNode.setScale(frameAnim.sizeInMapNode.width / frameAnim.origSize.width, frameAnim.sizeInMapNode.height / frameAnim.origSize.height);
          animNode.setAnchorPoint(cc.v2(0.5, 0)); // A special requirement for "image-type Tiled object" by "CocosCreator v2.0.1".
          safelyAddChild(self.node, animNode);
          setLocalZOrder(animNode, 5);
          anim.addClip(frameAnim.animationClip, "default");
          anim.play("default");
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

      self.barrierColliders = [];
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = boundaryObjs.barriers[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var boundaryObj = _step2.value;

          var newBarrier = cc.instantiate(self.barrierPrefab);
          var newBoundaryOffsetInMapNode = cc.v2(boundaryObj[0].x, boundaryObj[0].y);
          newBarrier.setPosition(newBoundaryOffsetInMapNode);
          newBarrier.setAnchorPoint(cc.v2(0, 0));
          var newBarrierColliderIns = newBarrier.getComponent(cc.PolygonCollider);
          newBarrierColliderIns.points = [];
          var _iteratorNormalCompletion6 = true;
          var _didIteratorError6 = false;
          var _iteratorError6 = undefined;

          try {
            for (var _iterator6 = boundaryObj[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
              var p = _step6.value;

              newBarrierColliderIns.points.push(p.sub(newBoundaryOffsetInMapNode));
            }
          } catch (err) {
            _didIteratorError6 = true;
            _iteratorError6 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion6 && _iterator6.return) {
                _iterator6.return();
              }
            } finally {
              if (_didIteratorError6) {
                throw _iteratorError6;
              }
            }
          }

          self.barrierColliders.push(newBarrierColliderIns);
          self.node.addChild(newBarrier);
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

      var allLayers = tiledMapIns.getLayers();
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = allLayers[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var layer = _step3.value;

          var layerType = layer.getProperty("type");
          switch (layerType) {
            case "normal":
              setLocalZOrder(layer.node, 0);
              break;
            case "barrier_and_shelter":
              setLocalZOrder(layer.node, 3);
              break;
            default:
              break;
          }
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

      var allObjectGroups = tiledMapIns.getObjectGroups();
      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = allObjectGroups[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var objectGroup = _step4.value;

          var objectGroupType = objectGroup.getProperty("type");
          switch (objectGroupType) {
            case "barrier_and_shelter":
              setLocalZOrder(objectGroup.node, 3);
              break;
            default:
              break;
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

      if (_this.joystickInputControllerNode.parent !== _this.node.parent.parent.getChildByName('JoystickContainer')) {
        _this.joystickInputControllerNode.parent = _this.node.parent.parent.getChildByName('JoystickContainer');
      }
      _this.joystickInputControllerNode.parent.width = _this.node.parent.width * 0.5;
      _this.joystickInputControllerNode.parent.height = _this.node.parent.height;

      var _iteratorNormalCompletion5 = true;
      var _didIteratorError5 = false;
      var _iteratorError5 = undefined;

      try {
        for (var _iterator5 = boundaryObjs.sheltersZReducer[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
          var _boundaryObj = _step5.value;

          var newShelter = cc.instantiate(self.shelterZReducerPrefab);
          var newBoundaryOffsetInMapNode = cc.v2(_boundaryObj[0].x, _boundaryObj[0].y);
          newShelter.setPosition(newBoundaryOffsetInMapNode);
          newShelter.setAnchorPoint(cc.v2(0, 0));
          var newShelterColliderIns = newShelter.getComponent(cc.PolygonCollider);
          newShelterColliderIns.points = [];
          var _iteratorNormalCompletion7 = true;
          var _didIteratorError7 = false;
          var _iteratorError7 = undefined;

          try {
            for (var _iterator7 = _boundaryObj[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
              var _p = _step7.value;

              newShelterColliderIns.points.push(_p.sub(newBoundaryOffsetInMapNode));
            }
          } catch (err) {
            _didIteratorError7 = true;
            _iteratorError7 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion7 && _iterator7.return) {
                _iterator7.return();
              }
            } finally {
              if (_didIteratorError7) {
                throw _iteratorError7;
              }
            }
          }

          self.node.addChild(newShelter);
        }
      } catch (err) {
        _didIteratorError5 = true;
        _iteratorError5 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion5 && _iterator5.return) {
            _iterator5.return();
          }
        } finally {
          if (_didIteratorError5) {
            throw _iteratorError5;
          }
        }
      }

      self.upsyncLoopInterval = setInterval(self._onPerUpsyncFrame.bind(self), self.clientUpsyncFps);
      window.handleRoomDownsyncFrame = function (roomDownsyncFrame) {
        if (ALL_BATTLE_STATES.WAITING != self.battleState && ALL_BATTLE_STATES.IN_BATTLE != self.battleState && ALL_BATTLE_STATES.IN_SETTLEMENT != self.battleState) return;

        self.countdownLabel.string = parseInt(roomDownsyncFrame.countdownNanos / 1000000000).toString();
        var frameId = roomDownsyncFrame.id;
        if (frameId <= self.lastRoomDownsyncFrameId) return;
        if (roomDownsyncFrame.countdownNanos == -1) {
          self.battleState = ALL_BATTLE_STATES.IN_SETTLEMENT;
          self.alertForGoingBackToLoginScene("Battle stopped!", self, false);
        }
        if (0 == self.lastRoomDownsyncFrameId) {
          self.battleState = ALL_BATTLE_STATES.IN_BATTLE;
          self.popupSimplePressToGo("Battle started!");
        }
        self.lastRoomDownsyncFrameId = frameId;
        var sentAt = roomDownsyncFrame.sentAt;
        var refFrameId = roomDownsyncFrame.refFrameId;
        var players = roomDownsyncFrame.players;
        var playerIdStrList = Object.keys(players);
        for (var i = 0; i < playerIdStrList.length; ++i) {
          var k = playerIdStrList[i];
          var playerId = parseInt(k);
          if (playerId == self.selfPlayerId) continue;
          var anotherPlayer = players[k];
          // Note that this callback is invoked in the NetworkThread, and the rendering should be executed in the GUIThread, e.g. within `update(dt)`.
          self.otherPlayerCachedDataDict[playerId] = anotherPlayer;
        }
        // TODO: Cope with removed players.
        // TODO: Cope with FullFrame reconstruction by `refFrameId` and a cache of recent FullFrames.
        // TODO: Inject a NetworkDoctor as introduced in https://app.yinxiang.com/shard/s61/nl/13267014/5c575124-01db-419b-9c02-ec81f78c6ddc/.
      };
    });
  },


  renderAnotherControlledPlayer: function renderAnotherControlledPlayer(mapIns, anotherPlayerCachedData, targetNode) {
    var mapNode = mapIns.node;
  },

  setupInputControls: function setupInputControls() {
    var instance = this;
    var mapNode = instance.node;
    var canvasNode = mapNode.parent;
    var joystickInputControllerScriptIns = canvasNode.getComponent("TouchEventsManager");
    var inputControlPollerMillis = 1000 / joystickInputControllerScriptIns.pollerFps;

    var ctrl = joystickInputControllerScriptIns;
    instance.ctrl = ctrl;

    instance.inputControlTimer = setInterval(function () {
      if (false == instance._inputControlEnabled) return;

      var newScheduledDirectionInWorldCoordinate = {
        dx: ctrl.activeDirection.dPjX,
        dy: ctrl.activeDirection.dPjY
      };

      var newScheduledDirectionInLocalCoordinate = newScheduledDirectionInWorldCoordinate;
      instance.selfPlayerScriptIns.scheduleNewDirection(newScheduledDirectionInLocalCoordinate);
    }, inputControlPollerMillis);
  },
  enableInputControls: function enableInputControls() {
    this._inputControlEnabled = true;
  },
  disableInputControls: function disableInputControls() {
    this._inputControlEnabled = false;
  },
  spawnSelfPlayer: function spawnSelfPlayer(selfPlayerInfo) {
    var instance = this;
    var newPlayerNode = cc.instantiate(instance.selfPlayerPrefab);
    newPlayerNode.setPosition(cc.v2(0, 0));
    newPlayerNode.getComponent("SelfPlayer").mapNode = instance.node;

    instance.node.addChild(newPlayerNode);

    setLocalZOrder(newPlayerNode, 5);
    instance.selfPlayerNode = newPlayerNode;
    instance.selfPlayerScriptIns = newPlayerNode.getComponent("SelfPlayer");
    instance.selfPlayerId = selfPlayerInfo.playerId;
  },
  update: function update(dt) {
    var self = this;
    var mapNode = self.node;
    var canvasNode = mapNode.parent;
    if (null != window.boundRoomId) {
      self.boundRoomIdLabel.string = window.boundRoomId;
    }
    if (null != self.selfPlayerId) {
      self.selfPlayerIdLabel.string = self.selfPlayerId;
    }
    for (var k in self.otherPlayerCachedDataDict) {
      var playerId = parseInt(k);
      var cachedPlayerData = self.otherPlayerCachedDataDict[playerId];
      var newPos = cc.v2(cachedPlayerData.x, cachedPlayerData.y);
      var targetNode = self.otherPlayerNodeDict[playerId];
      if (!targetNode) {
        targetNode = cc.instantiate(self.selfPlayerPrefab);
        targetNode.getComponent("SelfPlayer").mapNode = mapNode;
        targetNode.getComponent("SelfPlayer").speed = 0; // A dirty fix to prevent jittering.
        self.otherPlayerNodeDict[playerId] = targetNode;
        safelyAddChild(mapNode, targetNode);
        targetNode.setPosition(newPos);
        setLocalZOrder(targetNode, 5);
      }

      if (0 < targetNode.getNumberOfRunningActions()) {
        // A significant trick to smooth the position sync performance!
        continue;
      }
      if (0 != cachedPlayerData.dir.dx || 0 != cachedPlayerData.dir.dy) {
        var newScheduledDirection = self.ctrl.discretizeDirection(cachedPlayerData.dir.dx, cachedPlayerData.dir.dy, self.ctrl.joyStickEps);
        targetNode.getComponent("SelfPlayer").scheduleNewDirection(newScheduledDirection, true);
      }
      var oldPos = cc.v2(targetNode.x, targetNode.y);
      var toMoveByVec = newPos.sub(oldPos);
      var durationSeconds = toMoveByVec.mag() / self.selfPlayerScriptIns.speed;
      // cc.log(`Moving targetNode from <${oldPos.x}, ${oldPos.y}> to <${newPos.x}, ${newPos.y}> in ${durationSeconds} seconds.`);
      targetNode.runAction(cc.moveTo(durationSeconds, newPos));
    }
    // TODO: Cope with removed players.
  },
  transitToState: function transitToState(s) {
    var self = this;
    self.state = s;
  },
  logout: function logout(byClick /* The case where this param is "true" will be triggered within `ConfirmLogout.js`.*/, shouldRetainBoundRoomIdInBothVolatileAndPersistentStorage) {
    var localClearance = function localClearance() {
      if (byClick) {
        /**
        * WARNING: We MUST distinguish `byClick`, otherwise the `window.clientSession.onclose(event)` could be confused by local events!
        */
        window.closeWSConnection();
      }
      if (true != shouldRetainBoundRoomIdInBothVolatileAndPersistentStorage) {
        window.clearBoundRoomIdInBothVolatileAndPersistentStorage();
      }
      cc.sys.localStorage.removeItem('selfPlayer');
      cc.director.loadScene('login');
    };
    var self = this;
    if (null != cc.sys.localStorage.selfPlayer) {
      var selfPlayer = JSON.parse(cc.sys.localStorage.selfPlayer);
      var requestContent = {
        intAuthToken: selfPlayer.intAuthToken
      };
      try {
        NetworkUtils.ajax({
          url: backendAddress.PROTOCOL + '://' + backendAddress.HOST + ':' + backendAddress.PORT + constants.ROUTE_PATH.API + constants.ROUTE_PATH.PLAYER + constants.ROUTE_PATH.VERSION + constants.ROUTE_PATH.INT_AUTH_TOKEN + constants.ROUTE_PATH.LOGOUT,
          type: "POST",
          data: requestContent,
          success: function success(res) {
            if (res.ret != constants.RET_CODE.OK) {
              cc.log("Logout failed: " + res + ".");
            }
            localClearance();
          },
          error: function error(xhr, status, errMsg) {
            localClearance();
          },
          timeout: function timeout() {
            localClearance();
          }
        });
      } catch (e) {} finally {
        // For Safari (both desktop and mobile).
        localClearance();
      }
    } else {
      localClearance();
    }
  },
  onLogoutClicked: function onLogoutClicked(evt) {
    var self = this;
    self.disableInputControls();
    self.transitToState(ALL_MAP_STATES.SHOWING_MODAL_POPUP);
    var canvasNode = self.canvasNode;
    self.confirmLogoutNode.setScale(1 / canvasNode.getScale());
    safelyAddChild(canvasNode, self.confirmLogoutNode);
    setLocalZOrder(self.confirmLogoutNode, 10);
  },
  onLogoutConfirmationDismissed: function onLogoutConfirmationDismissed() {
    var self = this;
    self.transitToState(ALL_MAP_STATES.VISUAL);
    var canvasNode = self.canvasNode;
    canvasNode.removeChild(self.confirmLogoutNode);
    self.enableInputControls();
  }
});

cc._RF.pop();