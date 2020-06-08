Ext.define('Ft.multidesktop.util.DesktopManager', {
  mixins: ['Ext.mixin.Observable'],
  singleton: true,

  config: {
    localStorageId: null,
    localLogStorageId: null,
    desktopChooserBtn: null,
    desktopId: null,
    desktops: null,
    parentDesktopId: null,
    sessionPrefix: null,
    desktopStatusLog: null,
    // Default us to keeping a max of 100 log entries in the status log
    maxLogLength: 100
  },

  VERSION: '0.20200528.1408',

  STATUS: {
    OK: 'ok',
    WARNING: 'warning',
    ERROR: 'error'
  },

  constructor: function(config) {
    this.mixins.observable.constructor.call(this, config);
    this.setDesktops(new Ext.data.Store({model: 'Ft.multidesktop.model.Desktop'}));

    this.setDesktopId(window.desktop.desktopId);
    window.desktop.parentDesktopId && this.setParentDesktopId(window.desktop.parentDesktopId);

    Ext.on('desktop.launched', this.onLaunched.bind(this));
  },

  closeWidget: function(desktop, widgetId) {
    const targetDesktopId = desktop.isModel ? desktop.getId() : desktop,
      myId = this.getDesktopId();
    if (targetDesktopId === myId) {
      const widget = Ext.getCmp(widgetId);
      widget && widget.close();
    } else {
      Ext.fireEvent({source: myId, target: targetDesktopId, eventName: 'desktop.closewidget'}, targetDesktopId, widgetId);
    }
  },

  initializeDesktop: function() {
    if (this.getParentDesktopId()) {
      window.addEventListener('unload', this.onUnloadChild.bind(this));
      Ext.on({
        'desktop.close': () => window.close(),
        'desktop.childregistered': this.onRegistered.bind(this),
        // We only need to listen for 'closewidget' in the children because the event is only fired from the parent.
        'desktop.closewidget': this.onCloseWidget.bind(this)
      });
    } else {
      const myId = this.getDesktopId();

      this.beforeUnloadParentListener = this.onBeforeUnloadParent.bind(this);
      window.addEventListener('beforeunload', this.beforeUnloadParentListener);
      this.unloadParentListener = this.onUnloadParent.bind(this);
      window.addEventListener('unload', this.unloadParentListener);

      this.initializeLocalStorage(myId);
      Ext.on({
        'desktop.registerchild': this.onRegisterChildDesktop,
        'desktop.ping': (desktopId) => {
          Ext.fireEvent({source: myId, target: desktopId, eventName: 'desktop.pong'}, desktopId);
        },
        scope: this
      });
    }

    Ext.on({
      'desktop.tofront': () => window.alert(window.document.title),
      'desktop.closing': this.onDeregisterChildDesktop,
      'desktop.queryrunningwidgets': this.onListRunningWidgets,
      scope: this
    });
    this.storageEventListener = this.onResetDesktopEnvironment.bind(this);
    window.addEventListener('storage', this.storageEventListener);
  },

  initializeLocalStorage: function(id) {
    const mutex = new FastMutex(),
      localStorageId = this.getLocalStorageId();

    const obtainLockFn = async () => {
      try {
        // For some reason, 'await' works better on Chrome...
        await mutex.lock(localStorageId);
        const sessionStorage = Ext.JSON.decode(window.localStorage.getItem(localStorageId), true) || {sessions: [], counter: 0};

        sessionStorage.sessions.push(id);
        sessionStorage.counter++;
        this.setSessionPrefix(`${sessionStorage.sessions.length}`);
        window.localStorage.setItem(localStorageId, Ext.JSON.encode(sessionStorage));

        // release the mutex handler
        return mutex.release(localStorageId);
      } catch (msg) {
        window.console.error(msg);
        window.console.error('Trying again...');
        Ext.defer(obtainLockFn, 50);
      }
    };
    obtainLockFn();
    // No need to do the mutex here. We're starting up the main Desktop, and the log is going to be reset.
    window.localStorage.setItem(this.getLocalLogStorageId(), '[]');
  },

  isManagingDesktop: function() {
    return !this.getParentDesktopId();
  },

  listRunningWidgets: function(desktopToQuery) {
    const deferred = new Ext.Deferred(),
      myId = this.getDesktopId(),
      responseListener = Ext.on({
        'desktop.queryrunningwidgetsresponse': (source, response) => {
          deferred.resolve(response);
          responseListener.destroy();
        },
        destroyable: true
      });

    Ext.fireEvent({
      target: desktopToQuery,
      source: myId,
      eventName: 'desktop.queryrunningwidgets'
    }, myId);

    return deferred.promise;
  },

  moveToDesktop: function(widget, toDesktopId) {
    if (!widget.isDesktopMovable) {
      Ext.raise(`Attempt to relocate a non-movable Widget: ${widget.getId()}`);
      return;
    }
    const desktopChooserBtn = this.getDesktopChooserBtn(),
      fromDesktopId = this.getDesktopId(),
      // Done like this so the 'initialConfig' can override the xtype, but not the ownerWidget. This is because once the widget begins
      // traversing Desktops, it's 'ownerWidget' becomes part of the initialConfig. But...if the ownerWidget moves, it is updated on the
      // child. The method signature 'Ext.apply(one, two, three)' allows the values in 'one' to be overriden by 'two' & 'three', but
      // 'three' cannot override the values in 'two'.
      widgetCfg = Ext.apply({xtype: widget.getXType()}, {ownerWidget: widget.getOwnerWidget()}, widget.initialConfig),
      controller = widget.lookupController(),
      deferred = new Ext.Deferred();

    controller && Ext.Object.merge(widgetCfg, controller.getMovableConfigItems());
    widget.isMoving = true;
    const listener = Ext.on({
      'desktop.movetodesktopsuccess': (from, to, config, widgetId) => {
        const qs1 = Ext.Object.toQueryString(widgetCfg, true),
          qs2 = Ext.Object.toQueryString(config, true);

        // NOTE: Ext.Object.equals() doesn't work well w/ complex Objects, so we turn the configs into query strings and compare them.
        if (from === fromDesktopId && to === toDesktopId && qs1 === qs2) {
          widget.animate({
            duration: 500,
            to: {
              width: 0,
              height: 0,
              x: desktopChooserBtn.getX(),
              y: desktopChooserBtn.getY()
            },
            // NOTE: Need to defer the closing because the animation will complain if we destroy before it finishes
            callback: () => Ext.defer(() => widget.close(), 100)
          });
          deferred.resolve(widgetId);
        }
      },
      'desktop.movetodesktopfailure': (from, to, config, error) => {
        const qs1 = Ext.Object.toQueryString(widgetCfg, true),
          qs2 = Ext.Object.toQueryString(config, true);
        if (from === fromDesktopId && to === toDesktopId && qs1 === qs2) {
          widget.isMoving = false;
          deferred.reject(error);
        }
      },
      destroyable: true
    });
    Ext.fireEvent({
      eventName: 'desktop.movetodesktop',
      source: fromDesktopId,
      target: toDesktopId
    }, fromDesktopId, toDesktopId, widgetCfg);
    const timer = Ext.defer(() => {
      widget.isMoving = false;
      deferred.reject([widget, new Ext.Error(`No response from target Desktop ${toDesktopId}. Aborting move.`)]);
    }, 5000);
    return deferred.promise.always(() => {
      Ext.undefer(timer);
      listener.destroy();
    });
  },

  onDeregisterChildDesktop: function(childId) {
    const desktops = this.getDesktops(),
      desktop = desktops.getById(childId);

    desktops.remove(desktop);
    this._renumberDesktops();
  },

  onLaunched: function() {
    const desktopId = this.getDesktopId(),
      parentDesktopId = this.getParentDesktopId(),
      application = Ext.getApplication(),
      applicationName = application.getName(),
      localStorageId = `${applicationName}-${window.desktop.environment}`;

    this.setLocalStorageId(localStorageId);
    this.setLocalLogStorageId(`${localStorageId}-log`);

    application.setId(desktopId);
    application.getMainView().on('ready', this.onMainViewReady.bind(this));

    Ext.GlobalEvents.setBroadcastChannelId(`${application.getName()}-${parentDesktopId || desktopId}`);
    this.initializeDesktop(desktopId);
    parentDesktopId && Ext.fireEvent({source: desktopId, target: parentDesktopId, eventName: 'desktop.registerchild'}, desktopId);
  },

  onListRunningWidgets: function(requestingDesktop) {
    const windowBar = Ext.getApplication().getMainView().getDesktop().taskbar.windowBar,
      myId = this.getDesktopId(),
      widgets = [];

    windowBar.items.filterBy((item) => !!item.win).each((item) => {
      const widget = item.win;
      widgets.push({
        id: widget.getId(),
        text: widget.getTitle(),
        iconCls: widget.getIconCls()
      });
    });

    Ext.fireEvent({
      target: requestingDesktop,
      source: myId,
      eventName: 'desktop.queryrunningwidgetsresponse'
    }, myId, widgets);
  },

  onMainViewReady: function(mainView) {
    const desktop = mainView.getDesktop(),
      btn = desktop.taskbar.tray.insert(0, {
        xtype: 'button',
        itemId: 'desktopsBtn',
        cls: 'ft-multidesktop-desktopsbtn',
        iconCls: 'x-fa fas fa-desktop',
        showEmptyMenu: true,
        menu: {
          cls: 'ft-multidesktop-desktopsmenu',
          itemId: 'desktopsMenu'
        }
      });

    this.setDesktopChooserBtn(btn);
    btn.getMenu().on('beforeshow', this._onBeforeChooserMenuShow, this);
    if (this.getParentDesktopId()) {
      // Hide the Start button, the quick launch tray, and the shortcuts. Probably a better way to find these, but this works for now.
      desktop.taskbar.items.getAt(0).setVisible(false);
      desktop.taskbar.items.getAt(1).setVisible(false);
      desktop.shortcutsView.setVisible(false);
    } else {
      btn.getMenu().add([{
        iconCls: 'x-fa fas fa-plus',
        cls: 'ft-multidesktop-launchnewdesktop',
        itemId: 'launchNewDesktopBtn',
        text: 'Launch a new Desktop',
        handler: this.onLaunchChildDesktop.bind(this)
      }, '-']);
      window.document.title = this._addDesktop(this.getDesktopId());
    }
  },

  onResetDesktopEnvironment: function(evt) {
    if ((evt.key === this.getLocalStorageId()) && Ext.isEmpty(evt.newValue)) {
      // Remove our 'unload' listeners before attempting to close. Otherwise, we may prompt them again about closing multiple windows...
      this.beforeUnloadParentListener && window.removeEventListener('beforeunload', this.beforeUnloadParentListener);
      this.unloadParentListener && window.removeEventListener('unload', this.unloadParentListener);
      // Attempt to close ourselves...see the next comment...
      window.close();
      // Hack: As of Firefox 46/Chrome 77, scripts may only close windows that they opened. In other words, we may not actually 'close'
      // the parent window as it was opened by the user (either via new tab or new window). So we set it to 'about:blank' to enforce only
      // one Desktop exists: the one that initiated the reset.
      window.location.href = 'about:blank';
    }
  },

  reset: function() {
    const localStorageId = this.getLocalStorageId(),
      mutex = new FastMutex(),
      obtainLockFn = async () => {
        try {
          // For some reason, 'await' works better on Chrome...
          await mutex.lock(localStorageId);
          const settings = Ext.JSON.decode(window.localStorage.getItem(localStorageId), true) || {sessions: [], counter: 0};
          // Clear out the settings. This triggers all other Desktops to close.
          window.localStorage.removeItem(localStorageId);
          // Reset the values to 0. We do this so we retain any 'preference' settings.
          settings.sessions.length = settings.counter = 0;
          window.localStorage.setItem(localStorageId, Ext.JSON.encode(settings));

          // Reload by setting our location to...our location. We defer so the mutext may cleanly release itself. It likely doesn't matter
          // as we're reloading, but its probably good to let the mutex clean itself up.
          Ext.defer(() => window.location = window.location, 100);

          // release the mutex handler
          return mutex.release(localStorageId);
        } catch (msg) {
          window.console.error(msg);
          window.console.error('Trying again...');
          Ext.defer(obtainLockFn, 50);
        }
      };
    obtainLockFn();
  },

  /*
   ********************************************************************************************************************************
   ********************************************************************************************************************************
                                                BEGIN PARENT DESKTOP METHODS
   ********************************************************************************************************************************
   ********************************************************************************************************************************
   */
  closeDesktop: function(desktop) {
    const myId = this.getDesktopId();
    Ext.fireEvent({source: myId, target: desktop.getId(), eventName: 'desktop.close'}, myId);
  },

  onBeforeUnloadParent: function(evt) {
    if (this.getDesktops().getCount() > 1) {
      Ext.toast({
        title: 'Alert',
        html: 'Closing all child Desktops...',
        align: 'tr',
        autoClose: false,
        closable: true
      });
      evt.preventDefault();
      evt.returnValue = '';
    }
  },

  /**
   * Sets the flag to indicate whether a warning dialog should be shown to the user about Multiple Desktops.
   * @param {Boolean} showWarning
   * NOTE: This method is provided here mainly as a debugging tool. It does NOT utilize the FastMutex() API, and as such, some settings
   * may be lost. If used within the context of the application, consider wrapping this call within an 'async()/await()' sequence.
   */
  setShowMultipleDesktopsWarning: function(showWarning=true) {
    const localStorageId = this.getLocalStorageId(),
      sessionStorage = Ext.JSON.decode(window.localStorage.getItem(localStorageId), true);

    sessionStorage.showWarning = !!showWarning;
    window.localStorage.setItem(localStorageId, Ext.JSON.encode(sessionStorage));
  },

  launchChildDesktop: function() {
    const localStorageId = this.getLocalStorageId(),
      sessionStorage = Ext.JSON.decode(window.localStorage.getItem(localStorageId), true),
      url = Ext.String.urlAppend(window.location.href, `parentDesktopId=${this.getDesktopId()}`),
      deferred = new Ext.Deferred();

    this.on('childregistered', (newDesktop) => {
      deferred.resolve(newDesktop);
    }, this, {single: true});

    if (sessionStorage.showWarning !== false) {
      Ext.toast({
        title: 'Notice about Multiple Desktops',
        autoClose: false,
        closable: true,
        layout: {
          type: 'anchor',
          defaults: {
            anchor: '100%'
          }
        },
        items: [{
          xtype: 'component',
          html: `Multiple Desktops can be useful when running many apps at once. However, there are a few items to note:<ul>
                  <li>When reloading the main Desktop, all child Desktops will be closed.</li>
                  <li>When reloading a child Desktop, executing apps will not be restored upon reload.</li>
                 </ul>`
        }, {
          xtype: 'checkbox',
          fieldLabel: 'Ok, got it!',
          labelWidth: 60,
          labelSeparator: ''
        }],
        bbar: ['->', {
          text: 'Continue'
        }, {
          text: 'Cancel'
        }],
        listeners: {
          boxready: (toaster) => {
            toaster.down('checkbox').on('change', (checkbox, checked) => {
              sessionStorage.showWarning = !checked;
            });
            toaster.down('button[text=Cancel]').on('click', () => toaster.close());
            toaster.down('button[text=Continue]').on('click', () => {
              toaster.close();
              const mutex = new FastMutex(),
                obtainLockFn = async () => {
                  try {
                    // For some reason, 'await' works better on Chrome...
                    await mutex.lock(localStorageId);
                    const ss = Ext.JSON.decode(window.localStorage.getItem(localStorageId), true) || {sessions: [], counter: 0};
                    ss.showWarning = !!sessionStorage.showWarning;
                    window.localStorage.setItem(localStorageId, Ext.JSON.encode(ss));

                    // release the mutex handler
                    return mutex.release(localStorageId);
                  } catch (msg) {
                    window.console.error(msg);
                    window.console.error('Trying again...');
                    Ext.defer(obtainLockFn, 50);
                  }
                };
              obtainLockFn();
              window.open(url, '_blank');
            });
          }
        }
      });
    } else {
      window.open(url, '_blank');
    }
    return deferred.promise;
  },

  onLaunchChildDesktop: function() {
    this.launchChildDesktop();
  },

  logIncomingDesktopEvent: function(eventName, reporterId, sourceDesktopId, targetDesktopId) {
    this.logDesktopEvent('INCOMING', eventName, reporterId, sourceDesktopId, targetDesktopId);
  },

  logOutgoingDesktopEvent: function(eventName, reporterId, sourceDesktopId, targetDesktopId) {
    this.logDesktopEvent('OUTGOING', eventName, reporterId, sourceDesktopId, targetDesktopId);
  },

  logDesktopEvent: function(direction, eventName, reporterId, sourceDesktopId, targetDesktopId) {
    const mutex = new FastMutex(),
      maxLogLength = this.getMaxLogLength(),
      localLogStorageId = this.getLocalLogStorageId(),
      timestamp = new Date().getTime(),
      // Since the eventual log is written at a later date (see note on defer below), we need to get the data here as there is a chance
      // that the desktop will be gone by the time we get around to the actual writing (e.g., desktop.close).
      desktops = this.getDesktops(),
      sourceDesktop = desktops.getById(sourceDesktopId) || new Ft.multidesktop.model.Desktop({id: sourceDesktopId}),
      sourceDesktopData = sourceDesktop && Ext.clone(sourceDesktop.getData()),
      targetDesktop = targetDesktopId && (desktops.getById(targetDesktopId) || new Ft.multidesktop.model.Desktop({id: targetDesktopId})),
      targetDesktopData = targetDesktop && Ext.clone(targetDesktop.getData());

    let logEntry,
      logStorage;
    const obtainLockFn = async () => {
      try {
        // For some reason, 'await' works better on Chrome...
        await mutex.lock(localLogStorageId);
        logStorage = Ext.JSON.decode(window.localStorage.getItem(localLogStorageId), true) || [];

        logEntry = logStorage.push({
          timestamp: timestamp,
          direction: direction,
          event: eventName,
          reporter: reporterId,
          sourceDesktop: sourceDesktopData,
          targetDesktop: targetDesktopData
        });
        logStorage.length > maxLogLength && Ext.Array.splice(logStorage, 0, logStorage.length-maxLogLength);
        window.localStorage.setItem(localLogStorageId, Ext.JSON.encode(logStorage));

        // release the mutex handler
        return mutex.release(localLogStorageId);
      } catch (msg) {
        window.console.error(`Error writing to desktop log ${localLogStorageId}: ${msg}`);
      }
    };
    // Defer the logging. Since 'obtainLockFn' will block, we don't want the log to hold up the actual event (its not that important)
    Ext.defer(() => obtainLockFn().then(() => this.fireEvent('logupdated', logEntry, logStorage)), 100, this);
  },

  onRegisterChildDesktop: function(childId) {
    this._addDesktop(childId);
    const desktops = this.getDesktops();

    Ext.fireEvent(
        {source: this.getDesktopId(), eventName: 'desktop.childregistered'},
        childId, desktops.getData().getValues('data'), Ft.multidesktop.util.DesktopManager.VERSION);

    // Fire a local event. This is really for the 'Launch a new Desktop and move my Widget there' feature.
    this.fireEvent('childregistered', desktops.getById(childId), desktops);
  },

  onUnloadParent: function() {
    const myId = this.getDesktopId(),
      localStorageId = this.getLocalStorageId(),
      sessionStorage = Ext.JSON.decode(window.localStorage.getItem(localStorageId), true);

    this.getDesktops().each((desktop) => {
      Ext.fireEvent({source: myId, target: desktop.getId(), eventName: 'desktop.close'}, myId);
    });

    if (sessionStorage && Ext.Array.contains(sessionStorage.sessions, myId)) {
      Ext.Array.remove(sessionStorage.sessions, myId);
      sessionStorage.counter--;
    }
    window.localStorage.setItem(localStorageId, Ext.JSON.encode(sessionStorage));
  },

  updateMaxLogLength: function(newLength, oldLength) {
    if (newLength < oldLength) {
      const mutex = new FastMutex(),
        localLogStorageId = this.getLocalLogStorageId();

      const obtainLockFn = async () => {
        try {
          // For some reason, 'await' works better on Chrome...
          await mutex.lock(localLogStorageId);
          const logStorage = Ext.JSON.decode(window.localStorage.getItem(localLogStorageId), true) || [];

          // If we're longer than the new length, sort us by increasing time, then remove the items from the front to get to our new length
          if (logStorage.length > newLength) {
            Ext.Array.sort(logStorage, (a, b) => (a.timestamp < b.timestamp ? -1 : (a.timestamp > b.timestamp ? 1 : 0)));
            Ext.Array.splice(logStorage, 0, logStorage.length-newLength);
          }
          window.localStorage.setItem(localLogStorageId, Ext.JSON.encode(logStorage));

          // release the mutex handler
          return mutex.release(localLogStorageId);
        } catch (msg) {
          window.console.error(msg);
          window.console.error('Trying again...');
          Ext.defer(obtainLockFn, 50);
        }
      };
      // Defer the logging. Since 'obtainLockFn' will block, we don't want the log to hold up the actual event (its not that important)
      Ext.defer(() => obtainLockFn().then(() => this.fireEvent('loglengthchanged', newLength, oldLength)), 100, this);
    }
  },


  /*
   ********************************************************************************************************************************
   ********************************************************************************************************************************
                                                BEGIN CHILD DESKTOP METHODS
   ********************************************************************************************************************************
   ********************************************************************************************************************************
   */

  onCloseWidget: function(targetDesktop, widgetId) {
    this.closeWidget(targetDesktop, widgetId);
  },

  onOrphanedDesktop: function() {
    const parent = Ft.multidesktop.util.DesktopManager.getDesktops().findRecord('id', Ft.multidesktop.util.DesktopManager.getParentDesktopId()),
      parentTitle = (parent && parent.get('title')) || 'Unknown Parent';

    Ext.uninterval(this.pingInterval);
    new Ft.multidesktop.window.Dialog({
      title: 'Fatal Error',
      okButtonText: 'Reconnect',
      cancelButtonText: 'Close Desktop',
      html: `<div style='padding:5px'><p>Cannot contact the Parent Desktop <em>${parentTitle}</em></p>.<p>Do you want to attempt to
             reconnect, or close this Desktop?</p>`,
      listeners: {
        ok: () => {
          // Fire off a new 'ping' (one ping only), then reinstitute our timer. If the single ping fails, it will 'uninterval' the newly
          // created interval.
          this.onPingParentDesktop();
          this.pingInterval = Ext.interval(this.onPingParentDesktop, 30000, this);
        },
        cancel: () => window.close()
      }
    }).show();
  },

  onPingParentDesktop: function() {
    const desktopId = this.getDesktopId(),
      pingPongTimer = Ext.defer(this.onOrphanedDesktop.bind(this), 5000),
      pingPongListener = Ext.on({
        'desktop.pong': (targetDesktopId) => {
          if (targetDesktopId === desktopId) {
            console.log(`received pong response from parent desktop on ${new Date()}`);
            Ext.undefer(pingPongTimer);
            pingPongListener.destroy();
          }
        },
        destroyable: true
      });

    Ext.fireEvent({
      source: desktopId,
      target: this.getParentDesktopId(),
      eventName: 'desktop.ping'
    }, desktopId);
  },

  onRegistered: function(newDesktopId, desktops, version) {
    const mainView = Ext.getApplication().getMainView(),
      fn = () => {
        // This method serves as dual purpose:
        //  First, it lets up know that we've successfully registered w/ the main desktop, which triggers us to set our title and begin our
        //  'ping-pong' process of letting the main desktop know were here (and vice-versa).
        //  Second, when a new Desktop is registered, all child desktops need to be notified so they can update their list of available
        //  Desktops from which the 'Send to...' menus are generated (The menu items are updated on 'beforeshow').
        this.getDesktops().setData(desktops);
        const record = this.getDesktops().getById(this.getDesktopId());
        window.document.title = record.get('title');
        (version !== Ft.multidesktop.util.DesktopManager.VERSION) && this._showVersionMismatchWarning(version);
        (record.getId() === newDesktopId) && (this.pingInterval = Ext.interval(this.onPingParentDesktop, 300000, this));
      };
    if (mainView.isReady) {
      fn();
    } else {
      mainView.on('ready', fn.bind(this));
    }
  },

  onUnloadChild: function() {
    const myId = this.getDesktopId();
    // Fire an iternal event first so all our widgets have an opportunity to notify any owner widgets we're closing
    this.fireEvent('closing', myId);
    Ext.fireEvent({source: myId, eventName: 'desktop.closing'}, myId);
  },

  privates: {
    _addDesktop: function(id) {
      const desktops = this.getDesktops(),
        desktop = new Ft.multidesktop.model.Desktop({id: id, sessionPrefix: this.getSessionPrefix()});

      desktops.add(desktop);
      const title = this._generateDesktopTitle(this.getSessionPrefix(), desktops.getCount());
      desktop.set('title', title);

      return title;
    },

    _generateDesktopTitle: function(prefix, suffix) {
      const applicationName = Ext.getApplication().getName(),
        humanizedName = S(applicationName).humanize().titleCase().toString();

      return `${humanizedName} (${prefix}-${suffix})`;
    },

    _onBeforeChooserMenuShow: function(menu) {
      const myId = this.getDesktopId();
      Ext.each(menu.query('[cls~=ft-multidesktop-chooser-item]'), (menuItem) => menu.remove(menuItem));
      this.getDesktops().each((desktop) => {
        const id = desktop.getId(),
          title = desktop.get('title');
        menu.add({
          iconCls: 'x-fa fas fa-desktop',
          cls: 'ft-multidesktop-chooser-item',
          text: title,
          itemId: `ft-multidesktop-${id}`,
          tooltip: `Bring desktop ${title} to the front`,
          handler: () => Ext.fireEvent({source: myId, target: id, eventName: 'desktop.tofront'})
        });
      });
    },

    _renumberDesktops: function() {
      const myId = this.getDesktopId();
      this.getDesktops().each((desktop, index) => {
        const title = this._generateDesktopTitle(desktop.get('sessionPrefix'), index+1);
        desktop.set('title', title);
        (myId == desktop.getId()) && (window.document.title = title);
      });
    },

    _showVersionMismatchWarning: function(version) {
      new Ft.multidesktop.window.Dialog({
        title: 'Warning',
        showButtons: false,
        height: 175,
        html: `<p style='padding-left: 10px; padding-right: 10px'>
                  <strong>WARNING</strong>: The software version has changed since the main Desktop was loaded:
               </p>
               <div style='padding-left: 20px; padding-right: 20px'>
                  <table>
                    <tr><td>${this.getDesktops().first().get('title')}:</td><td>${version}</td></tr>
                    <tr><td>${window.document.title}:</td><td>${Ft.multidesktop.util.DesktopManager.VERSION}</td></tr>
                  </table>
               </div>
               <p style='padding-left: 10px; padding-right: 10px'>
                  It is highly recommended you reload the main Desktop before continuing.
               </p>`
      }).show();
    }
  }
});
