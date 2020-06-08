Ext.define('Ft.multidesktop.ui.desktopmanager.View', {
  extend: 'Ext.panel.Panel',
  alias: 'widget.ft-desktopmanagerview',
  layout: 'border',

  initComponent: function() {
    this.items = [{
      xtype: 'panel',
      layout: {
        type: 'accordion',
        multi: true
      },
      padding: 2,
      region: 'west',
      width: 400,
      resizable: true,
      items: [{
        title: 'Desktops',
        reference: 'activeDesktops',
        xtype: 'grid',
        flex: 1,
        collapsible: false,
        store: Ft.multidesktop.util.DesktopManager.getDesktops(),
        columns: [{
          dataIndex: 'title',
          flex: 1,
          text: 'Title'
        }, {
          dataIndex: 'id',
          flex: 1,
          text: 'Id'
        }, {
          xtype: 'actioncolumn',
          align: 'center',
          width: 50,
          items: [{
            getClass: (value, meta, record) => {
              return Ft.multidesktop.util.DesktopManager.getDesktopId() === record.getId() ? '' : 'x-fa far fa-window-close red-foreground';
            },
            getTip: (value, meta, record) => {
              return Ft.multidesktop.util.DesktopManager.getDesktopId() === record.getId() ? null : 'Close this Desktop';
            },
            handler: 'onCloseDesktop'
          }]
        }],
        listeners: {
          select: 'onDesktopSelected'
        },
        tools: [{
          iconCls: 'x-fa fas fa-power-off',
          tooltip: 'Reset all Desktops',
          callback: 'onResetDesktopEnvironment'
        }],
        viewConfig: {
          listeners: {
            itemremove: 'onDesktopsItemRemoved'
          }
        }
      }, {
        title: 'Widgets running on',
        reference: 'runningWidgets',
        xtype: 'grid',
        store: new Ext.data.Store(),
        flex: 1,
        columns: [{
          xtype: 'templatecolumn',
          width: 50,
          tpl: '<i class="{iconCls}"></i>'
        }, {
          dataIndex: 'text',
          flex: 1,
          text: 'Name'
        }, {
          xtype: 'actioncolumn',
          align: 'center',
          width: 50,
          items: [{
            iconCls: 'x-fa far fa-times-circle red-foreground',
            tooltip: 'Close this Widget',
            handler: 'onCloseWidget'
          }]
        }]
      }]
    }, {
      xtype: 'grid',
      reference: 'desktopManagerViewLog',
      padding: 2,
      title: 'Log',
      region: 'center',
      resizable: true,
      columns: [{
        dataIndex: 'direction',
        width: 50,
        align: 'center',
        renderer: (val) => {
          switch (true) {
            case /incoming/i.test(val):
              return '<i class="x-fa fas fa-sign-in-alt" data-qtip="Incoming"></i>';
            case /outgoing/i.test(val):
              return '<i class="x-fa fas fa-sign-out-alt fa-flip-horizontal" data-qtip="Outgoing"></i>';
          }
        }
      }, {
        dataIndex: 'event',
        text: 'Event',
        flex: 1
      }, {
        dataIndex: 'reporter',
        flex: 1,
        text: 'Logged By'
      }, {
        flex: 1,
        text: 'Event Source Desktop Id',
        renderer: (val, meta, record) => {
          const source = record.getSourceDesktop();
          return source.getId();
        }
      }, {
        flex: 1,
        text: 'Event Target Desktop Id',
        renderer: (val, meta, record) => {
          const target = record.getTargetDesktop();
          return target ? target.getId() : 'N/A';
        }
      }, {
        dataIndex: 'timestamp',
        text: 'Date/Time',
        flex: 1,
        renderer: (value) => moment(value).format()
      }],
      bbar: [{
        xtype: 'container',
        layout: 'hbox',
        items: [{
          xtype: 'combobox',
          reference: 'maxLogLength',
          editable: false,
          fieldLabel: 'Keep a maximum of',
          labelWidth: 125,
          width: 200,
          labelSeparator: '',
          displayField: 'name',
          valueField: 'value',
          store: new Ext.data.ArrayStore({
            fields: ['name', 'value'],
            data: [['50', 50], ['100', 100], ['250', 250], ['500', 500]]
          }),
          listeners: {
            change: 'onSetLogLength'
          }
        }, {
          xtype: 'displayfield',
          value: '<span style="padding-left:5px">entries</span>'
        }]
      }, '->', {
        tooltip: 'Clear Logs',
        iconCls: 'x-fa far fa-trash-alt',
        handler: 'onClearLog'
      }, {
        tooltip: 'Refresh Logs',
        iconCls: 'x-fa far fa-sync-alt',
        handler: 'onRefreshLog'
      }]
    }];
    this.callParent(arguments);
  }
});
