Ext.define('Fortitude.multidesktop.ui.desktopmanager.Controller', {
  extend: 'Ext.app.ViewController',
  alias: 'controller.ftde-desktopmanager',

  config: {
    selectedDesktop: null
  },

  control: {
    '#': {
      beforeclose: 'onClose'
    }
  },

  init: function() {
    const localLogStorageId = Fortitude.multidesktop.util.DesktopManager.getLocalLogStorageId(),
      logStorage = Ext.JSON.decode(window.localStorage.getItem(localLogStorageId), true) || [],
      store = new Ext.data.Store({
        model: 'Fortitude.multidesktop.model.DesktopStatus',
        data: logStorage,
        sorters: [{property: 'timestamp', direction: 'ASC'}]
      });

    this.callParent(arguments);
    this.lookup('maxLogLength').setValue(Fortitude.multidesktop.util.DesktopManager.getMaxLogLength());
    this.lookup('desktopManagerViewLog').setStore(store);
    this.storageEventListener = this.onLogUpdated.bind(this);
    window.addEventListener('storage', this.storageEventListener);
    this.mon(Fortitude.multidesktop.util.DesktopManager, {
      loglengthchanged: this.onLogLengthChanged,
      logupdated: this.onRefreshLog,
      closing: this.onLocalWidgetClosing,
      scope: this
    });

    // By default, select the first Desktop in the list (likely the main Desktop)
    this.lookup('activeDesktops').getSelectionModel().select(0);

    this.globalListeners = Ext.on({
      'desktop.movablewidgetlaunched': this.onWidgetLaunched,
      'desktop.movetodesktopsuccess': this.onWidgetMovedToDesktop,
      'desktop.windowclosing': this.onWidgetClosing,
      scope: this,
      destroyable: true
    });
  },

  onClearLog: function() {
    const localLogStorageId = Fortitude.multidesktop.util.DesktopManager.getLocalLogStorageId();
    window.localStorage.setItem(localLogStorageId, '[]');
    this.lookup('desktopManagerViewLog').getStore().removeAll();
  },

  onClose: function() {
    window.removeEventListener('storage', this.storageEventListener);
    this.globalListeners.destroy();
  },

  onCloseDesktop: function(grid, row, col, cfg, evt, desktop) {
    new Fortitude.multidesktop.window.Dialog({
      teatherTo: this.getView(),
      title: 'Confirm',
      html: `<p style='padding-left:5px;padding-right:5px'>Are you certain you want to close ${desktop.get('title')}?<br/><br/>
             NOTE: This may affect Widgets running on other Desktops.</p>`,
      listeners: {
        ok: () => Fortitude.multidesktop.util.DesktopManager.closeDesktop(desktop)
      }
    }).show();
  },

  onCloseWidget: function(grid, row, col, cfg, evt, record) {
    const desktop = this.getSelectedDesktop();
    new Fortitude.multidesktop.window.Dialog({
      teatherTo: this.getView(),
      title: 'Confirm',
      html: `<p style='padding-left:5px;padding-right:5px'>Are you certain you want to close the widget '${record.get('text')}'
             <br/>running on ${desktop.get('title')}?</p>`,
      listeners: {
        ok: () => Fortitude.multidesktop.util.DesktopManager.closeWidget(this.getSelectedDesktop(), record.getId())
      }
    }).show();
  },

  onDesktopSelected: function(table, record) {
    this.setSelectedDesktop(record);
    this.queryRunningWidgets(record);
  },

  onDesktopsItemRemoved: function(records) {
    const grid = this.lookup('activeDesktops');
    Ext.Array.contains(records, this.getSelectedDesktop()) && grid.getSelectionModel().select(0);
  },

  onLogLengthChanged: function(evt) {
    this.refreshLog();
  },

  onLogUpdated: function(evt) {
    if (evt.key === Fortitude.multidesktop.util.DesktopManager.getLocalLogStorageId()) {
      const data = Ext.JSON.decode(evt.newValue);
      this.lookup('desktopManagerViewLog').getStore().loadRawData(data, false);
    }
  },

  onRefreshLog: function() {
    this.refreshLog();
  },

  onResetDesktopEnvironment: function() {
    const env = S(window.desktop.environment).humanize().titleCase();
    new Fortitude.multidesktop.window.Dialog({
      title: 'Warning',
      okButtonText: 'Continue',
      html: `<div style='padding:5px'><p>Warning</p><p>Resetting the Desktop environment will close all windows and tabs for the ${env}
            environment and reload this session.</p>`,
      listeners: {
        ok: () => {
          // Fire off a new 'ping' (one ping only), then reinstitute our timer. If the single ping fails, it will 'uninterval' the newly
          // created interval.
          Fortitude.multidesktop.util.DesktopManager.reset();
        }
      }
    }).show();
  },

  onSetLogLength: function(combo, value) {
    // This call fires 'loglengthchanged', which we listen to. Setting the log length is asynchronus, so refreshing here does nothing.
    Fortitude.multidesktop.util.DesktopManager.setMaxLogLength(value);
  },

  onLocalWidgetClosing: function(widgetId) {
    this.onWidgetClosing(Fortitude.multidesktop.util.DesktopManager.getDesktopId(), widgetId);
  },

  onWidgetClosing: function(desktopId, widgetId) {
    const grid = this.lookup('activeDesktops'),
      desktop = grid.getSelection()[0],
      store = this.lookup('runningWidgets').getStore(),
      record = store.getById(widgetId);

    // We only want to remvoe it from our list if the event is (a) from the desktop we're looking at, and (b) its in our list. It is
    // entirely possible to receive a closing event from a widgetId that exists on 2 different Desktops, so we need the first qualifier
    // to ensure we're processing the correct event.
    desktop && record && (desktopId === desktop.getId()) && store.remove(record);
  },

  onWidgetLaunched: function(desktopId) {
    const grid = this.lookup('activeDesktops'),
      desktop = grid.getSelection()[0];

    desktop && (desktop.getId() === desktopId) && this.queryRunningWidgets(desktop);
  },

  onWidgetMovedToDesktop: function(oldDesktopId, newDesktopId, cfg, widgetId) {
    const grid = this.lookup('activeDesktops'),
      desktop = grid.getSelection()[0],
      store = this.lookup('runningWidgets').getStore(),
      record = store.getById(widgetId);

    if (desktop) {
      (newDesktopId === desktop.getId()) && this.queryRunningWidgets(desktop);

      // We only want to remove the widget from our list if (a) it's in our list, and (b) the old desktop is the desktop we're looking at.
      // It is entirely possible to receive a closing event from a widgetId that exists on 2 different Desktops, so we need the second
      // qualifier to ensure we're processing the correct event.
      record && (oldDesktopId === desktop.getId()) && store.remove(record);
    }
  },

  refreshLog: function() {
    const localLogStorageId = Fortitude.multidesktop.util.DesktopManager.getLocalLogStorageId(),
      jsonData = window.localStorage.getItem(localLogStorageId) || '[]',
      logData = Ext.JSON.decode(jsonData);

    this.lookup('desktopManagerViewLog').getStore().loadRawData(logData, false);
  },

  queryRunningWidgets: function(record) {
    const widgets = this.lookup('runningWidgets');

    widgets.setTitle(`${widgets.initialConfig.title} ${record.get('title')}`);

    // Since we're getting the list of widgets from the taskbar, and the displaying of the widget contains an animation, we need to delay
    // the initial selection to give ouselves an opportunity to be put into the taskbar.
    Ext.defer(() => {
      Fortitude.multidesktop.util.DesktopManager.listRunningWidgets(record.getId()).then((response) => {
        widgets.getStore().setData(response);
      });
    }, 100);
  }
});
