var assert = require("assert")
    , cloud = require("../cloud")
    , request = require("request")
    , nano = require("nano")
    , follow = require("follow")
    ;

// mini test framework
var testNames = {};
function start(name) {
    console.log("start", name)
    testNames[name] = new Date();
};
function finish(name) {
    var start = testNames[name];
    delete testNames[name];
    console.log("finish", name, new Date() - start);
    if (Object.keys(testNames).length == 0) {
        setTimeout(function() {
            if (Object.keys(testNames).length == 0) {
                console.log("all tests done")
                process.exit(0)
            }
        }, 50);
    }
};
// end mini test framework

var user_email = 'drspaceman@30rock.com';

function userTag(doc) {
    doc.owner = user_email;
    // doc._readers = {
    //     names : [user_email]
    // };
    return doc;
};

function errLog(err) {
  if (err) {
    console.error(err.status_code, err.error, err.message)
  }
};

// only works on urls like http://example.com/foobar
function urlDb(url) {
    url = url.split("/");
    db = url.pop();
    return nano(url.join('/')).use(db);
};

var db_host = "http://jchrisa:jchrisa@127.0.0.1:5984"
    , db_name = "test-control"
    , couch = nano(db_host)
    , db = couch.use(db_name)
    , userDb = couch.use("_users") // todo the tests should use a test user db
    ;

userDb.get("org.couchdb.user:"+user_email, function(err, r, doc) {
    if (!err) {
        userDb.destroy(doc._id, doc._rev, errLog)
    }
    // it's OK to do this out of order as we are not counting seq's in the users db
});

function fixtureDb(fun) {
    couch.db.destroy(db_name, function(err, resp) {
        couch.db.create(db_name, function(err, resp) {
            if (err && err.status_code != 412) {
                errLog(err, resp)
            } else {
                fun()
            }
        });
    });
};


// test that a new channel doc gets made ready and a database is created for it
fixtureDb(function() {
    // start cloud server
    cloud.start(db_host, db_name);
    start("send new device email");

    // create a new device doc
    // this would ordinarily be done by the device UI on first launch
    db.insert({
        owner : user_email,
        type : "device",
        state : "new",
        device_code : "random-code",
        oauth_creds : {
        // TODO test that duplicate keys or tokens result in an error, not an overwrite
          consumer_key: "randConsumerKey",
          consumer_secret: "consumerSecret",
          token_secret: "tokenSecret",
          token: "randToken"
        }
    }, errLog);
    
    var feed = new follow.Feed({db : [db_host, db_name].join('/')});
    feed.since = 0;
    feed.include_docs = true;
    feed.on('error', function() {});
    var confirm_code, device_code;
    feed.on('change', function(change) {
        // wait for states to change
        // console.log("change", change)
        var doc = change.doc;
        switch (change.seq) {
        case 1:
            assert.ok(doc.type == "device")
            assert.ok(doc.state == "new")
        break;
        case 2:
            // when we see a new device we email the owner
            assert.ok(doc.type == "device")
            assert.ok(doc.state == "confirming")
            confirm_code = doc.confirm_code;
            device_code = doc.device_code;
            finish("send new device email");
            // next test
            start("create a new channel");
            db.insert(userTag({
                type : "channel",
                state : "new",
                name : "My Channel Name"
            }), errLog);
        break;
        case 3:
            assert.ok(doc.type == "channel")
            assert.ok(doc.state == "new")
        break;
        case 4:
            assert.ok(doc.type == "channel")
            assert.ok(doc.state == "ready");
            feed2 = new follow.Feed({db : doc.syncpoint, include_docs : true})
            feed2.on('error', function() {});
            feed2.on('change', function(change) {
                if (change.id == "description") {
                    // assert that the db exists and it contains a description doc
                    assert.ok(change.doc.name ==  "My Channel Name")
                    finish("create a new channel");
                }
            });
            feed2.follow();
            start("confirm device user")
            // we are testing that if you create a clicked confirm doc that matches the code,
            // your device will be activated
            db.insert({
                type : "confirm",
                state : "clicked",
                confirm_code : confirm_code,
                device_code : device_code
            }, errLog);
        break;
        case 6:
            assert.ok(doc.type == "device")
            assert.ok(doc.state == "active")
            assert.ok(doc.confirm_code == confirm_code)
            var userDb = couch.use("_users");
            userDb.get("org.couchdb.user:"+user_email, function(err, r, doc) {
                assert.ok(!err)
                assert.equal(doc.oauth.consumer_keys["randConsumerKey"], "consumerSecret");
                assert.equal(doc.oauth.tokens["randToken"], "tokenSecret");
                
                couch.request({
                    db : "_config",
                }, function(err, resp, data) {
                    // these assertions can go away once
                    // https://github.com/fdmanana/couchdb/compare/oauth_users_db
                    // is merged.
                    assert.ok(!err)
                    assert.ok(data.oauth_consumer_secrets)
                    assert.ok(data.oauth_token_users)
                    assert.ok(data.oauth_token_secrets)
            assert.equal(data.oauth_consumer_secrets["randConsumerKey"], "consumerSecret");
            assert.equal(data.oauth_token_users["randToken"], user_email);
            assert.equal(data.oauth_token_secrets["randToken"], "tokenSecret");
                    finish("confirm device user")
                });
            });
        break;
        }
    });
    feed.follow();
});



