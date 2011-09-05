// for testing against the photoshare example
var db_host = "http://jchrisa:jchrisa@127.0.0.1:5984"
    , db_name = "photoshare-control-device"
    , cloud = require("../cloud")
    ;
    
cloud.start(db_host, db_name);
