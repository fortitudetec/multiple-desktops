Ext.define('Ft.multidesktop.window.plugin.DesktopMovable', {
  extend: 'Ext.plugin.Abstract',
  alias: 'plugin.ft-desktopmovable',

  init: function(cmp) {
    const sendToDesktopMenu = new Ext.menu.Menu(),
      DesktopManager = Ft.multidesktop.util.DesktopManager,
      application = Ext.getApplication(),
      desktopId = application && application.getId(),
      controller = cmp.lookupController();

    this.setCmp(cmp);

    cmp.isDesktopMovable = true;

    controller && !controller.getMovableConfigItems && (controller.getMovableConfigItems = Ext.emptyFn);

    cmp.addTool({
      type: 'collapse',
      tooltip: 'Send to Desktop...',
      callback: (win, tool, evt) => {
        const menuItems = [{disabled: true, text: '<strong>Send to Desktop</strong>'}, '-'];
        DesktopManager.getDesktops().each((desktop) => {
          const id = desktop.getId();
          menuItems.push({
            dektopId: id,
            text: desktop.get('title'),
            disabled: (desktopId === id),
            handler: (item) => DesktopManager.moveToDesktop(cmp, id).then(
                () => {
                  Ext.toast({
                    title: 'Notification',
                    html: `Successfully moved Widget to ${item.text}`,
                    align: 'tr'
                  });
                },
                (e) => {
                  if (!e.message) {
                    console.log('Received error moving widget to desktop, but there is no error message:');
                    console.trace(e);
                    debugger;
                  }
                  new Ft.multidesktop.window.Dialog({
                    title: 'Error',
                    html: `<p>Could not move Widget to ${item.text}:<br/>${e.message}</p>`,
                    teatherTo: cmp
                  }).show();
                }
            )
          });
        });
        DesktopManager.isManagingDesktop() && menuItems.push({
          text: 'New Desktop...',
          cls: 'ft-desktopmovable-new-desktop-item',
          handler: () => DesktopManager.launchChildDesktop().then((newDesktop) => {
            Ext.defer(() => {
              DesktopManager.moveToDesktop(cmp, newDesktop.getId());
            }, 500);
          })
        });
        sendToDesktopMenu.removeAll();
        sendToDesktopMenu.add(menuItems);
        sendToDesktopMenu.showBy(tool);
      }
    });

    cmp.on({
      beforedestroy: () => this.movableListeners && this.movableListeners.destroy(),
      ownerwidgetset: () => this.addListeners()
    });
    cmp.getOwnerWidget() && this.addListeners();
    Ext.fireEvent({
      source: desktopId,
      eventName: 'desktop.movablewidgetlaunched'
    }, desktopId, cmp.getId());
  },

  addListeners: function() {
    const movable = this.getCmp();

    this.movableListeners = Ext.on({
      'desktop.windowclosing': (desktopId, widgetId) => {
        const ownerWidget = movable.getOwnerWidget();
        if ((desktopId === ownerWidget.desktopId) && (widgetId === ownerWidget.id)) {
          this.movableListeners.destroy();
          movable.close();
        }
      },
      destroyable: true
    });
  }
}, function() {
  const completeMoveFn = function(desktop, oldDesktopId, newDesktopId, cfg) {
    try {
      const movable = desktop.createWindow(Ext.clone(cfg)).show(),
        ownerWidget = movable.getOwnerWidget();
      Ext.fireEvent({
        source: newDesktopId,
        eventName: 'desktop.movetodesktopsuccess'
      }, oldDesktopId, newDesktopId, cfg, movable.getId());
      // Fire an event locally from the moved widget. This allows the widget itself the opportunity to notify any child widgets of its move.
      movable.fireEvent('movetodesktopsuccess', movable, newDesktopId, oldDesktopId);
      ownerWidget && Ext.fireEvent({
        source: newDesktopId,
        target: ownerWidget.desktopId,
        eventName: 'webstringer.desktop.managedwidgetmoved'
      }, movable.getId(), newDesktopId);
    } catch (e) {
      Ext.fireEvent({
        source: newDesktopId,
        eventName: 'desktop.movetodesktopfailure'
      }, oldDesktopId, newDesktopId, cfg, {sourceClass: e.sourceClass, sourceMethod: e.sourceMethod, message: e.message, stack: e.stack});
    }
  };

  // NOTE: This is processed on the TARGET Desktop (e.g., the Desktop the Widget is being moved to).
  Ext.on('desktop.movetodesktop', function(oldDesktopId, newDesktopId, cfg) {
    const mainView = Ext.getApplication().getMainView();

    // TODO: Replace this w/ a 'callWhen'
    mainView.isReady ?
      completeMoveFn(mainView.getDesktop(), oldDesktopId, newDesktopId, cfg) :
      mainView.on('ready', () => completeMoveFn(mainView.getDesktop(), oldDesktopId, newDesktopId, cfg));
  });
});
