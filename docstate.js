var follow = require("follow")
    , stately = require("stately")
    ;

exports.connect = function(db_host, db_name) {
    var feed = new follow.Feed({db : [db_host, db_name].join('/')})
        , safeMachine, safeStates = {}
        , cautiousMachine, unsafeStates = {}
        ;
    
    feed.include_docs = true;
    feed.on("change", function(change) {
        if (change.doc.type && change.doc.state) 
            console.log(change.doc.type, change.doc.state)
        safeMachine.handle(change.doc);
        cautiousMachine.handle(change.doc);
    });
    
    function start() {
        safeMachine = stately.define(safeStates);
        cautiousMachine = stately.define(unsafeStates);
        feed.follow();
    }
    
    function registerSafeCallback(type, state, cb) {
        safeStates[type] = safeStates[type] || {};
        safeStates[type][state] = cb;
    }
    
    function registerUnsafeCallback(type, state, cb) {
        unsafeStates[type] = unsafeStates[type] || {};
        unsafeStates[type][state] = cb;
    }
    
    return {
        start : start,
        safe : registerSafeCallback,
        unsafe : registerUnsafeCallback
    };
};
