var docstate = require("./docstate")
    , nano = require("nano")
    ;

var PUBLIC_HOST_URL = "http://localhost:5984/"

function errLog(err, resp) {
  if (err) {
    console.error(err, resp)
  }
};

// only works on urls like http://example.com/foobar
function urlDb(url) {
    url = url.split("/");
    db = url.pop();
    return nano(url.join('/')).use(db);
};

function handleChannels(control, db, server) {
    control.safe("channel", "new", function(doc) {
        var db_name = "db-"+doc._id;
        if (doc["public"]) {
            errLog("PDI","please implement public databases")
        } else {
            server.db.create(db_name, function(err, resp) {
                if (err && err.code != 412) {
                    // 412 means the db already exists, so we should still mark the channel ready.
                    errLog(err, resp);
                } else {
                    doc.state = "ready";
                    doc.syncpoint = PUBLIC_HOST_URL + db_name;
                    db.insert(doc, errLog);
                }
            });
        }
    });

    control.safe("channel", "ready", function(doc) {
        var channel_db = urlDb(doc.syncpoint);
        channel_db.insert({
            _id : 'description',
            name : doc.name
        }, errLog);
    });
};

function handleDevices(control, db, server) {
    control.unsafe("device", "new", function(doc) {
      var confirm_code = uuid();
      ensureUserExists(doc.owner, function(err) {
        if (err) {
          errLog(err)
        } else {
          sendEmail(doc.owner, confirm_code, function(err) {
            if (err) {
              errLog(err)
            } else {
              doc.state = "confirming";
              doc.confirm_code = confirm_code;
              db.save(doc, errLog);      
            }
          });   
        }
      });
    });

    control.safe("device", "confirmed", function(doc) {
      // move device_creds to user document, now the device can use them to auth as the user
      userDb.open("user:"+doc.owner, function(err, userDoc) {
        userDoc.delegates = userDoc.delegates || [];
        userDoc.delegates.push(doc.device_key)
        userDb.save(userDoc, function(err) {
          if (err) {
            errLog(err)
          } else {
            doc.state = "active"
            db.save(doc, errLog);
          }
        })
      });
    });
};

exports.start = function(db_host, db_name) {
    var control = docstate.connect(db_host, db_name)
        , server = nano(db_host)
        , db = server.use(db_name)
        ;
    
    handleChannels(control, db, server);
    handleDevices(control, db, server);
    
    control.start();
};

function ensureUserExists(username) {
  // make sure there is a _user document for that user
  // when the user first visits the confirmation link they can setup credentials (browser id?)
}

// put device_creds as pending delegate on the user (w/ timestamps for expiry as these are created on the client's pace...)
//   (maybe create user*)
// new doc can only be read by the user associated with the device creds, 
// so until the pending creds become active, the device can't connect.
// email the user with link to confirm. 
// when the email goes, set device-doc.state = email-sent




// let's talk about new backups




