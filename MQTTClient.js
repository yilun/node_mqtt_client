/**
  *This is a simple MQTT cient on node.js
  *Author: Fan Yilun @CEIT @08 FEB 2011
  */
var sys = require('sys');
var net = require('net');
var EventEmitter = require('events').EventEmitter;

var tab = '\t';
var crlf = '\r\n';

var MQTTCONNECT = 0x10;
var MQTTPUBLISH = 0x30;
var MQTTSUBSCRIBE = 8<<4;

var KEEPALIVE = 15000;

var client = MQTTClient();

function MQTTClient(port, host) {
    EventEmitter.call(this);

    this.connected = false;
    this.sessionSend = false;
    this.sessionOpened = false;

    this.conn = net.createConnection(port || 1883, host || '127.0.0.1');
    this.conn.setEncoding('utf8');
  
    var self = this;

    this.conn.addListener('data', function (data) {
        if(!this.sessionOpened){
            sys.puts("len:"+data.length+' @3:'+data.charCodeAt(3)+'\n');
            if(data.length==4 && data.charCodeAt(3)==0){
                this.sessionOpened = true;
                sys.puts("Session opend\n");
            }else{
                //this.conn.end();
                //this.conn.destroy();
                return;
            }
        } else {
            //sys.puts('len:' + data.length+' Data received:'+data+'\n');
            var buf = new Buffer(data);
            onData(buf);
        }
    });

    this.conn.addListener('connect', function () {
        sys.puts('connected\n');
        this.connected = true;
        //Once connected, send open stream to broker
        openSession('mbed');
    });
  
    this.conn.addListener('end', function() {
        this.connected = false;
        this.sessionSend = false;
        this.sessionOpened = false;
        sys.puts('Connection closed by broker');
    });
}

sys.inherits(MQTTClient, EventEmitter);
exports.MQTTClient = MQTTClient;


openSession = function (id) {

	var i = 0;
    var buffer = new Buffer(16+id.length);
    
	buffer[i++] = MQTTCONNECT;
    buffer[i++] = 14+id.length;
	buffer[i++] = 0x00;
	buffer[i++] = 0x06;
	buffer[i++] = 0x4d;
	buffer[i++] = 0x51;
	buffer[i++] = 0x49;
	buffer[i++] = 0x73;
	buffer[i++] = 0x64;
	buffer[i++] = 0x70;
	buffer[i++] = 0x03;

	buffer[i++] = 0x02;

	//Keep alive for 30s
	buffer[i++] = 0x00;
	buffer[i++] = KEEPALIVE/500;  //Keepalive for 30s

	buffer[i++] = 0x00;
    buffer[i++] = id.length;
    
    for (var n = 0; n < id.length; n++) { //Insert client id 
        buffer[i++] = id.charCodeAt(n); //Convert string to utf8
	}
    
    sys.puts(buffer.toString('utf8',0, 16)+'  '+buffer.length);
    this.conn.write(buffer, encoding="utf8");

    this.sessionSend = true;
    sys.puts('Connect as :'+id+'\n');
    
    publish('/node', 'here is nodejs');
    subscribe('/mirror');
};


/*subscribes to topics */
subscribe = function (sub_topic) {

    var i = 0;
	var buffer = new Buffer(7+sub_topic.length);;
    
	//fixed header
	buffer[i++] = MQTTSUBSCRIBE;
	buffer[i++] = 5 + sub_topic.length;

	//varibale header
	buffer[i++] = 0;
	buffer[i++] = 10; //message id

	//payload
	buffer[i++] = 0;
	buffer[i++] = sub_topic.length;
	for (var j = 0; j < sub_topic.length; j++) {
		buffer[i++] = sub_topic.charCodeAt(j);
    }
	buffer[i++] = 0;
    
    sys.puts('Subcribe to:'+sub_topic);
    sys.puts("Subscribe send len:"+buffer.length+'\n');
    
	this.conn.write(buffer, encoding="utf8");
};

/*publishes to topics*/
publish = function (pub_topic, payload) {

	var i = 0, n = 0;
    var var_header = new Buffer(3+pub_topic.length);
    
    //Variable header
	//Assume payload length no longer than 128
    var_header[i++] = 0;
    var_header[i++] = pub_topic.length;
	for (n = 0; n < pub_topic.length; n++) {
		var_header[i++] = pub_topic.charCodeAt(n);
    }
	var_header[i++] = 0;
    
	i = 0;
    var buffer = new Buffer(2+var_header.length+payload.length);
    
	//Fix header
	buffer[i++] = MQTTPUBLISH;
	buffer[i++] = payload.length + var_header.length;

	for (n = 0; n < var_header.length; n++) {
		buffer[i++] = var_header[n];
    }
	for (n = 0; n < payload.length; n++) { //Insert payloads
		buffer[i++] = payload.charCodeAt(n);
    }
    
    sys.puts("Publish: "+pub_topic+' -- '+payload);
    sys.puts("Publish len:"+buffer.length+'\n');
	
    this.conn.write(buffer, encoding="utf8");
};

onData = function(data){
    var type = data[0]>>4;
    sys.puts('\n0:'+type);
    sys.puts('1:'+data[1]);
    sys.puts('2:'+data[2]);
    sys.puts('3:'+data[3]);
    if (type == 3) { // PUBLISH
        var tl = data[3]+data[2]; //<<4
        sys.puts(tl);
        var topic = new Buffer(tl);
        for(var i = 0; i < tl; i++){
            topic[i] = data[i+4];
        }
        if(tl+4 <= data.length){
            var payload = data.slice(tl+4, data.length);
            sys.puts("Receive on Topic:"+topic);
            sys.puts("Payload:"+payload+'\n');
        }
    } else if (type == 12) { // PINGREG -- Ask for alive
        //Send [208, 0] to server
        this.conn.write(0xd0, encoding="utf8");
        this.conn.write(0x00, encoding="utf8");
        sys.puts('Send 208 0');
        var packet208 = '';
        packet208[0] = 0xd0;
        packet208[1] = 0x00;
        this.conn.write(packet208, encoding="utf8");
        //lastActivity = timer.read_ms();
    }

}

MQTTClient.prototype.live = function () {
	//Send [192, 0] to server
	this.conn.write(0xc0, encoding="utf8");
	this.conn.write(0x00, encoding="utf8");
};

MQTTClient.prototype.disconnect = function () {
	//Send [224,0] to server
	this.conn.write(0xe0, encoding="utf8");
	this.conn.write(0x00, encoding="utf8");
};
