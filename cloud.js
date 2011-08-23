var docstate = require("./docstate")
    , nano = require("nano")
    ;

var PUBLIC_HOST_URL = "http://localhost:5984/"

function errLog(err, resp) {
  if (err) {
      if (err.message) {
          console.error(err.status_code, err.error, err.message)
      } else {
          console.error(err, resp)          
      }
  }
};

// todo move to nano
// only works on urls like http://example.com/foobar
function urlDb(url) {
    url = url.split("/");
    db = url.pop();
    return nano(url.join('/')).use(db);
};


function sendEmail(address, code, cb) {
    console.warn("not actually sending an email", address, code)
    cb(false);
}


function ensureUserDoc(userDb, name, fun) {
    var user_doc_id = "org.couchdb.user:"+name;
    userDb.get(user_doc_id, function(err, r, userDoc) {
        if (err && err.status_code == 404) {
            fun(false, {
                _id : user_doc_id,
                type : "user",
                name : name,
                roles : []
            });
        } else {
            console.log(userDoc)
            fun(false, userDoc);
        }
    });
}


function handleDevices(control, db, server) {
    var userDb = server.use("_users");
    control.safe("confirm","clicked", function(doc) {
        var confirm_code = doc.confirm_code;
        // load the device doc with confirm_code == code
        // TODO use a real view
        db.list({include_docs:true}, function(err, r, view) {
            var deviceDoc;
            view.rows.forEach(function(row) {
               if (row.doc.confirm_code && row.doc.confirm_code == confirm_code &&
                   row.doc.type && row.doc.type == "device") {
                   deviceDoc = row.doc;
               }
            });
            // now we need to ensure the user exists and make sure the device has a delegate on it
            var device_key = deviceDoc.device_key;
            // move device_creds to user document, now the device can use them to auth as the user
            ensureUserDoc(userDb, deviceDoc.owner, function(err, userDoc) {
                userDoc.delegates = userDoc.delegates || [];
                userDoc.delegates.push(deviceDoc.device_key);
                userDb.insert(userDoc, function(err) {
                  if (err) {
                    errLog(err, doc.owner)
                  } else {
                    deviceDoc.state = "active";
                    db.insert(deviceDoc, errLog);
                  }
                })
            });
        });
    });

    control.unsafe("device", "new", function(doc) {
      var confirm_code = Math.random().toString().split('.').pop(); // todo better entropy
      sendEmail(doc.owner, confirm_code, function(err) {
        if (err) {
          errLog(err)
        } else {
          doc.state = "confirming";
          doc.confirm_code = confirm_code;
          db.insert(doc, errLog);      
        }
      });
    });

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

exports.start = function(db_host, db_name) {
    var control = docstate.connect(db_host, db_name)
        , server = nano(db_host)
        , db = server.use(db_name)
        ;
    
    handleDevices(control, db, server);
    handleChannels(control, db, server);
    
    control.start();
};

// put device_creds as pending delegate on the user (w/ timestamps for expiry as these are created on the client's pace...)
//   (maybe create user*)
// new doc can only be read by the user associated with the device creds, 
// so until the pending creds become active, the device can't connect.
// email the user with link to confirm. 
// when the email goes, set device-doc.state = email-sent




// let's talk about new backups




