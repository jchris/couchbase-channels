var assert = require("assert")
    , cloud = require("../cloud")
    , request = require("request")
    , nano = require("nano")
    , follow = require("follow")
    ;

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
    ;

var testNames = {};
function start(name) {
    console.log("start", name)
    testNames[name] = new Date();
};
function finished(name) {
    var start = testNames[name];
    delete testNames[name];
    console.log(name, new Date() - start);
    if (Object.keys(testNames).length == 0) {
        setTimeout(function() {
            if (Object.keys(testNames).length == 0) {
                console.log("all tests done")
                process.exit(0)
            }
        }, 50);
    }

};

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
    db.insert({
        owner : user_email,
        type : "device",
        state : "new",
        device_key : "random"
    }, errLog);
    
    var feed = new follow.Feed({db : [db_host, db_name].join('/')});
    feed.since = 0;
    feed.include_docs = true;
    feed.on('error', function() {});
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
            assert.ok(doc.type == "device")
            assert.ok(doc.state == "confirming")
            finished("send new device email");
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
            assert.ok(change.doc.state == "ready");
            feed2 = new follow.Feed({db : change.doc.syncpoint, include_docs : true})
            feed2.on('error', function() {});
            feed2.on('change', function(change) {
                if (change.id == "description") {
                    // assert that the db exists and it contains a description doc
                    assert.ok(change.doc.name ==  "My Channel Name")
                    finished("create a new channel");
                }
            });
            feed2.follow();
        break;
        }
        // if (change.seq == 2) {
        //     assert.ok(change.doc.state == "ready");
        //     feed2 = new follow.Feed({db : change.doc.syncpoint})
        //     feed2.on('error', function() {});
        //     feed2.on('change', function(change) {
        //         if (change.id == "description") {
        //             // assert that the db exists and it contains a description doc
        //             assert.ok(true)
        //             finished("create a new channel");
        //         }
        //     });
        //     feed2.follow();
        // }
    });
    feed.follow();

    // create a new channel

    var feed = new follow.Feed({db : [db_host, db_name].join('/')});
    feed.since = 0;
    feed.include_docs = true;
    feed.on('error', function() {});
    feed.on('change', function(change) {
        // wait for channel doc to become ready
        if (change.seq == 1) {
        }

    });
    feed.follow();
});



