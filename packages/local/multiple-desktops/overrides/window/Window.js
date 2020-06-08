Ext.define('Ft.multidesktop.override.window.Window', {
  override: 'Ext.window.Window',

  layout: 'fit',

  /**
   * @cfg {Boolean} desktopMovable
   */

  config: {
    ownerWidget: null
  },

  initComponent: function() {
    this.desktopMovable && (this.plugins = Ext.Array.push(Ext.Array.from(this.plugins), ['ft-desktopmovable']));
    this.callParent(arguments);
    if (this.teatherTo) {
      this.mon(this.teatherTo, {
        destroy: () => this.destroy(),
        tofront: () => Ext.getApplication().getMainView().getDesktop().getDesktopZIndexManager().bringToFront(this)
      });
    }
    this.desktopEvents = Ext.GlobalEvents.on({
      'desktop.movetowidgetfront': (widgetId) => {
        (this.getId() === widgetId) && this.toFront();
      },
      destroyable: true
    });
  },

  updateOwnerWidget: function(ownerWidget) {
    this.ownerWidgetListener && this.ownerWidgetListener.destroy();
    this.desktopManagerListener && this.desktopManagerListener.destroy();
    if (ownerWidget) {
      this.ownerWidgetListener = Ext.on({
        'desktop.movetodesktopsuccess': (oldDesktopId, newDesktopId, cfg, widgetId) => {
          ownerWidget.id === widgetId && ownerWidget.desktopId === oldDesktopId && (ownerWidget.desktopId = newDesktopId);
        },
        destroyable: true
      });
      this.desktopManagerListener = Ft.multidesktop.util.DesktopManager.on({
        'closing': (desktopId) => {
          // The 'closing' event is fired first locally, then globally (as 'desktop.closing'). This allows local Widgets to notify
          // owners they are closing down, just in case they are on separate desktops.
          // Two things to note:
          //  - We only call 'notifyClosing' if our owner is on a different desktop. If our owner is on the same Desktop, no need to notify
          //    it since its closing as well...
          //  - As mentioned above, we call 'notifyClosing' here and not 'close'. Why? Because the widget has an 'animateTarget', which
          //    causes the close method to animate, meaning the eventual call to 'onDestroy' is deferred. But since this is only performed
          //    within a window.unload callback, deferring things isn't an option...the actual browser window is going away...
          (ownerWidget.desktopId !== desktopId) && this.notifyClosing();
        },
        destroyable: true
      });
    }
    this.fireEvent('ownerwidgetset', this, ownerWidget);
  },

  onDestroy: function() {
    !this.isMoving && this.notifyClosing();
    this.desktopEvents.destroy();
  },

  notifyClosing: function() {
    const desktopId = Ft.multidesktop.util.DesktopManager.getDesktopId();
    this.desktopMovable && !this.getId().match(/-ghost$/) && Ext.fireEvent({
      source: desktopId,
      eventName: 'desktop.windowclosing'
    }, desktopId, this.getId());
  }
});
