var stately = require("stately");

var LOCALHOST = "http://127.0.0.1:5984/"

var control = stately.follow(LOCALHOST + "control");

var docState = control.docState;

function userTag(doc) {
    doc.owner = user_email;
    doc._readers = {
        names : [user_email]
    };
    return doc;
};

docState("device", "active", function() {
    // might not need to do anything
    // what we really needed was replication access to the control db (for our owner's stuff)
});

docState("subscription", "active", function(doc) {
    // configure replication for each active subscription
    var local  = "sub-" + doc._id
    , remote = doc.syncpoint
    ;
    startReplication(local, remote)
});

docState("subscription", ["stopped", "paused"], function() {
    // cancel replication for each stopped or paused subscription
});

function startReplication(local, remote) {
    var repl = {
        source : remote,
        target : local,
        continuous : true,
        create_target : true
    };
    db.server.replicate(repl, errLog);
}


function normalizeSyncConfig() {
    db.view("channels/active-subscriptions", function(err, view) {
        replicatorDb.allDocs({include_docs:true},function(err, docs) {
            // for each active subscription, make sure there is a replicator doc
        });
    });
};

// channels are private by default
// auto-subscribe to my channels, not to other folks
// todo, implement public : true for channels
function createChannel(channelName) {
    db.save(userTag({
        type : "channel",
        state : "new",
        name : channelName
    }), errLog);
}

// auto-subscribe to my channels
// use well-known id here so user choices across devices converge
docState("channel", ["new","ready"], function(doc) {
    var sub_id = doc._id + "-sub-" + device_owner_email;
    if (doc.owner != device_owner_email) return;
    db.open(sub_id, function(err, sub) {
        if (err) {
            sub = userTag({
                _id : sub_id,
                type : "subscription",
                state : "active"
            });
        }
        sub.remote = doc.syncpoint;
        db.save(sub, errLog);
    });
});




