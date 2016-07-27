var bodyParser = require('body-parser'),
AWS = require( "aws-sdk" ),
md5 = require('MD5'),
express = require('express'),
app = module.exports = express(),
geoip = require('geoip-lite'),
path = require('path');

AWS.config.getCredentials();
app.use(bodyParser.json({limit: '50mb'}));

var primary_region = process.env.primary_region
var secondary_region = process.env.secondary_region

var primary_kinesis = process.env.primary_kinesis
var secondary_kinesis = process.env.secondary_kinesis

var kinesis_primary = new AWS.Kinesis({region:primary_region});
var kinesis_secondary = new AWS.Kinesis({region:secondary_region});

app.get('/', function (req, res){
	res.send('Hello World');
	res.end();
});
app.post('/prod/appengine_logs_to_elasticsearch/:project', function (req, res) {
	res.status(202).send({'msg': 'Logs Delivered'});
	res.end();
	var project = req.params.project;
	body = req.body;
	var b = new Buffer(body.message.data, 'base64');
	var message = JSON.parse(b.toString());
	// console.log(message)
	if (message.hasOwnProperty('protoPayload')){
		if (message.protoPayload.hasOwnProperty('@type')){
			if (message.protoPayload['@type'] == 'type.googleapis.com/google.appengine.logging.v1.RequestLog'){

				if (message.protoPayload.hasOwnProperty('taskQueueName')){
					taskQueueName = message.protoPayload.taskQueueName;
				}
				var re = /-[0-9]+$/;
				message.protoPayload.taskQueueGroup = taskQueueName.replace(re, '');
				// Cleanup Latency
				re = /s$/;
				message.protoPayload.latency = message.protoPayload.latency.replace(re, '');
				message.w_user = "";
				message.w_acct_num = "";
				message.w_acct_name = "";
				// Get Account Number, Name, and User
				if (message.protoPayload.hasOwnProperty('line')){
					message.protoPayload.line.some(function(line) {
						if (line.hasOwnProperty('logMessage')){
							if (line.logMessage.indexOf('REQINFO') > -1){
								re = /REQINFO: wf_user:(.*?) wf_acct_num:(.*?) wf_acct:(.*)/i;
								var matchObj = line.logMessage.match(re);
								if (matchObj.length == 4 ){
									// This is user's email do not send to datadog.
									message.w_user = matchObj.group(1)
									message.w_acct_name = matchObj[3];
									message.w_acct_num = matchObj[2];
								}else{
									console.log("No MatchObj Found for REQINFO!");
								}
								return true;
							}
						}
					});
				} else{
					console.log("No Log Lines Found");
				}
				if (message.protoPayload.hasOwnProperty('pendingTime')){
					re = /s$/;
					message.protoPayload.pendingTime = message.protoPayload.pendingTime.replace(re, '');
				}else{
					message.protoPayload.pendingTime = 0
				}
				//Geo Locate
				var geo = geoip.lookup(message.protoPayload.ip);
				if (geo !== null &&  geo.hasOwnProperty('ll')){
					geo.ll = [geo.ll[1],geo.ll[0]]
				}
				message.geo = geo;
				console.log("Kinesis Published");
				writeToKinesis(convertToHarbourSpec(message));
			}else{
				console.log("@type is unxpected");
				//res.end();
			}
		}else{
			console.log("@type is missing");
		}
	}else{
		console.log("ProtoPayload is missing");
		console.log(message)
	}
});

function writeToKinesis(doc) {
	var recordParams = {
		DeliveryStreamName: primary_kinesis,
		Record: {
			Data: new Buffer(doc, 'base64').toString('ascii')
		}
	};
	kinesis_primary.putRecord(recordParams, function(err, data) {
		if (err) {
			console.error("Kinesis Error" + err);
		}
	});
}

function convertToHarbourSpec(doc) {
	console.log(doc)
	data = {};
	data['version'] = "1.0";
	data['timestamp'] = doc['protoPayload']['endTime'];
	data['exception'] = {'stacktrace': ''}
	doc['protoPayload']['line'].forEach(function(line) {
		 //Add each of the protoPayload log messages to one long string
		 data['exception']['message'] += (line['logMessage'] + " \n ")
	 });
	//For testing only. we should set this to the highest level of severity between the logMessages
  data['level'] = doc['protoPayload']['line'][0]['severity'].toLowerCase();
	//Still needs process ID and process CMD, not sure where to get those

	return JSON.stringify(data);
}
