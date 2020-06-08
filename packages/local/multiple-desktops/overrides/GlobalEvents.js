Ext.define('Fortitude.multidesktop.override.GlobalEvents', {
  override: 'Ext.GlobalEvents',

  fireEvent: function() {
    const broadcastArgs = arguments[0];

    /**
     *  API is:
     *    {
     *       source: sourceDesktopId,
     *       target: targetDesktopId,
     *       eventName: broadcastEventName,
     *    },
     *    eventArguments...
     */
    if (Ext.isObject(broadcastArgs)) {
      const target = broadcastArgs.target,
        desktopId = Fortitude.multidesktop.util.DesktopManager.getDesktopId(),
        eventArguments = Ext.Array.slice(arguments, 1, arguments.length);

      // Looks confusing, but here's the logic:
      //  - First: If no target was specified, or if its the current desktop, fire the event globally on this desktop
      //  - Second: If the target is not the current desktop, fire the event as a BroadcastChannel.
      // We do it this way because BroadcastChannel doesn't receive events within the window it fired from, and we want events not specified
      // for a certain Desktop to go across ALL Desktops, even the one doing the firing.
      if (!target || (target === desktopId)) {
        this.callParent(Ext.Array.push([broadcastArgs.eventName], eventArguments));
      }
      if (target !== desktopId) {
        const broadcastChannel = this.getBroadcastChannel();
        Fortitude.multidesktop.util.DesktopManager.logOutgoingDesktopEvent(broadcastArgs.eventName, desktopId, desktopId, broadcastArgs.target);
        broadcastChannel.postMessage(Ext.apply(broadcastArgs, {eventArguments: eventArguments}));
      }

      return;
    }
    this.callParent(arguments);
  },

  updateBroadcastChannel: function(channel) {
    this.processBroadcastChannelEventFn = this.processBroadcastChannelEvent.bind(this);
    channel && channel.addEventListener('message', this.processBroadcastChannelEventFn);
  },

  updateBroadcastChannelId: function(newId) {
    this.getBroadcastChannel() && this.getBroadcastChannel().removeEventListener('message', this.processBroadcastChannelEventFn);
    newId && this.setBroadcastChannel(new BroadcastChannel(newId));
  },

  processBroadcastChannelEvent: function(evt) {
    const data = evt.data || {},
      myId = Ext.getApplication().getId();
    if (data.eventName && (data.source !== myId)) {
      // If a target was not specified, or if one was, and its us, fire the event.
      if (!data.target || (data.target === myId)) {
        Fortitude.multidesktop.util.DesktopManager.logIncomingDesktopEvent(data.eventName, myId, data.source, data.target);
        this.fireEventArgs(data.eventName, data.eventArguments);
      }
    }
  }
}, function() {
  // Add the broadcastChannel config here since its an override
  this.self.addConfig({
    broadcastChannel: null,
    broadcastChannelId: null
  });
});
