Ext.define('Ft.multidesktop.ui.desktopmanager.Module', {
  extend: 'Ext.ux.desktop.Module',

  id: 'desktopmanager',

  init: function() {
    this.launcher = {
      text: 'Desktop Manager',
      iconCls: 'x-fa fas fa-chalkboard-teacher',
      handler: this.createWindow,
      scope: this,
      windowId: 'ft-desktop-manager'
    };
  },

  createWindow: function() {
    const desktop = this.app.getDesktop(),
      win = desktop.getWindow('ft-desktop-manager') || desktop.createWindow({
        id: 'ft-desktop-manager',
        controller: {
          type: 'ft-desktopmanager'
        },
        title: this.launcher.text,
        iconCls: 'x-fa fas fa-chalkboard-teacher',
        constrainHeader: true,
        items: {
          xtype: 'ft-desktopmanagerview',
          reference: 'desktopManagerView',
          width: 1200,
          height: 600
        }
      });
    win.show();
    return win;
  }
});
