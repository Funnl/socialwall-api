// Social Wall API Server
// Copyright two guys who went to AngelHack
// This server is a bare-bones node.js HTTP server
// whose entire goal is to work as an MVP

var app 			= require('http').createServer(handler)
var io 				= require('socket.io').listen(app);
var fs 				= require('fs');
var _ 				= require('lodash');
var url 			= require('url');
var request 		= require('request');
var moment 			= require('moment');
var AWS 			= require('aws-sdk');
// These keys should be environment variables per the AWS docs, but this whole file is one big example
// of what not to do... why stop there :)
AWS.config 			= new AWS.Config({
  accessKeyId: 'AKIAJOHT3NRZIGUIC3GA', secretAccessKey: 'Fnmz8KBqFjgMBeUekIJMbUKtrQcRdNp11BeXAbPm', region: 'us-west-2'
});
// Note: Twitter requires are defined closer to the consuming code

var cache = {
	instance_id : "mvp",
	settings : {
		// TODO: turn tag into an array
		tag: "sactoadvantage",
		eventId: "default-event",
		startTime : moment()
	},
	lasts: {
		instagramSearch : null,
		twitterSearch: null,
	},
	statuses: {
		twitter_stream : false,
		instagram_stream: false
	},
	counts : { // TODO: later
		twitter: 0,
		instagram: 0
	}
};

// stores tweets and instagram in memory
var data_cache = {
	instagram : {
		data: []
	},
	twitter : []
};

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});

//////////////////////////////////
// Settings
/////////////////////////////////

var s3 = new AWS.S3({apiVersion: '2006-03-01'});

var settingsS3Params = {
	Bucket: 'socialwall.hiramsoft.com',
	Key: 'api-settings.' + cache.instance_id + '.json'
};

function refreshSettings(){
	s3.getObject(settingsS3Params, function(err, data) {
		if (err){
			console.log(err, err.stack); // an error occurred
		}
		else {
			try{
				var newSettings = JSON.parse(data.Body);
				cache.settings = _.merge(cache.settings, newSettings);
			} catch(e){
				console.log("Failed to parse settings data " + data.Body);
				console.log(e);
			}
		}
	});
}

function saveSettings(){
	var putObjParams = _.cloneDeep(settingsS3Params);
	putObjParams.Body = JSON.stringify(cache.settings);
	putObjParams.ContentEncoding = "UTF-8";
	putObjParams.ContentType = "application/json";
	s3.putObject(putObjParams, function(err, data) {
		if (err){
			console.log(err, err.stack); // an error occurred
		}
		else {
			console.log("Settings saved");
		}
	});
};

var MAX_ITEMS_IN_CACHE = 200;

function checkTwitterCache() {
	// we can't hold too much in memory... so we need to dump to s3
	// eventually...
	// and, I'm ignoring the threading issues since node will actually take
	// care of it

	// for now, we just want to limit lengths to 200 items in each category

	if(data_cache.twitter){
		if(data_cache.twitter.length){
			if(data_cache.twitter.length > MAX_ITEMS_IN_CACHE)
			{
				var extra = data_cache.twitter.length - MAX_ITEMS_IN_CACHE;
				data_cache.twitter.splice(MAX_ITEMS_IN_CACHE, extra);
				console.log("twitter spliced");
			}
		}
	}
}
function checkInstagramCache() {
	if(data_cache.instagram && data_cache.instagram.data){
		if(data_cache.instagram.data.length){
			if(data_cache.instagram.data.length > MAX_ITEMS_IN_CACHE)
			{
				var extra = data_cache.instagram.data.length - MAX_ITEMS_IN_CACHE;
				data_cache.instagram.data.splice(MAX_ITEMS_IN_CACHE, extra);
				console.log("instagram spliced");
			}
		}
	}
}

//////////////////////////////////
// Web client sockets
/////////////////////////////////

io.sockets.on('connection', function (socket) {
	console.log("New client... using cache of existing data");
	console.log("Pushing instagram");
	socket.emit('instagram', data_cache.instagram);
	console.log("Pushing twitter");
	_.forEach(data_cache.twitter, function(tweet){
		socket.emit('twitter', tweet);
	})

	// send the client what we know about the current event
	socket.emit('event_settings', cache.settings);
});


/////////////////////////////
//  HTTP Handlers
/////////////////////////////

function healthHandler(req_url, req, res){
	res.end("Succesfully updated heroku")
}

function defaultHander(req_url, req, res){
	showFile("index.html", res);
}

function debugHandler(req_url, req, res){
	showFile("client-debug.html", res);
}

function mgrHandler(req_url, req, res){
	if(req_url.query){
		var command = req_url.query["command"];

		// yes, this means commands are processed using get requests
		// ........
		if(command && command.length > 0)
		{
			// enforce basic api-key if issuing a command
			var api_key = req_url.query["api-key"];
			if(!api_key || api_key != "swconfig")
			{
				res.end("Bad key");
				return;
			}

			if(command == "instagram")
			{
				res.end("instagram");
			} else if ( command == "show-settings" ) {
				res.end(JSON.stringify(cache));
			} else if ( command == "refresh-settings" ) {
				refreshSettings();
				res.end("Settings refreshed");
			} else if ( command == "start-twitter-stream" ) {
				startTwitterStream();
				res.end("twitter stream started");
			} else if ( command == "stop-twitter-stream" ) {
				stopTwitterStream();
				res.end("twitter stream stopped");
			} else if ( command == "start-instagram-stream" ) {
				startInstagramStream();
				res.end("instagram stream started");
			} else if ( command == "stop-instagram-stream" ) {
				stopInstagramStream();
				res.end("instagram stream stopped");
			} else if ( command == "just-twitter-search" ) {
				twitterSearch();
				res.end("Twitter-searched");
			} else if ( command == "just-instagram-search" ) {
				instagramSearch(false);
				res.end("Twitter-searched");
			} else if ( command == "prime-data" ) {
				instagramSearch(false);
				twitterSearch();
				res.end("Data primed");
			} else if ( command == "start-streams" ) {
				startTwitterStream();
				startInstagramStream();
				res.end("Streams started");
			} else if ( command == "stop-streams" ) {
				stopTwitterStream();
				stopInstagramStream();
				res.end("Streams stopped");
			} else if ( command == "show-instagram" ) {
				res.end(JSON.stringify(data_cache.instagram));
			} else if ( command == "show-twitter" ) {
				res.end(JSON.stringify(data_cache.twitter));
			} else if ( command == "reset-data" ) {

				data_cache.twitter = [];
				data_cache.instagram = {
					data: []
				};
				res.end("All data purged");
			} else if ( command == "set-event" ) {
				var newTag = req_url.query["tag-name"];
				var eventId = req_url.query["event-id"];

				if(!newTag || !eventId)
				{
					res.end("newTag and eventId need to be set");
				}
				else
				{
					cache.settings.tag = newTag.toLowerCase().trim();
					cache.settings.eventId = eventId.toLowerCase().trim();

					// TODO: Reset all of the registrations
					saveSettings();

					res.end("Settings saved");
				}
			} else {
				showFile("commands.html", res);
			}

			return; // unconditional return for now
		}
	}

	showFile("manager.html", res);
}

function showFile(filename, res){
	fs.readFile(__dirname + '/views/' + filename,
	  function (err, data) {
	    if (err) {
	      res.writeHead(500);
	      return res.end('Error loading ' + filename);
	    }

	    res.writeHead(200);
	    res.end(data);
	  });
}

function handler (req, res) {
	var req_url = url.parse(req.url, true);
	// What is this?  Avoiding express... MVP
	var utest = req_url.pathname.toString();

	if(utest == "/"){
		defaultHander(req_url, req, res);
	} else if (utest == '/client-debug') {
		debugHandler(req_url, req, res);
	} else if (utest == '/instagram') {
		inboundInstagramHandler(req_url, req, res);
	} else if (utest == '/health') {
		healthHandler(req_url, req, res);		
	} else if (utest == '/mgr') {
		mgrHandler(req_url, req, res);		
	} else
	{
		res.end("");
	}
}


//////////////////////////////////
// Instagram
/////////////////////////////////

function inboundInstagramHandler(req_url, req, res) {
	if(req_url.query && req_url.query["hub.mode"])
	{
		console.log("Responding to instagram streaming challenge");
		res.end(req_url.query["hub.challenge"]);
	}
	else
	{
		console.log("Waiting for data to process the instagram post");
		req.on('data', function (chunk) {
			try{
				//console.log('INSTAGRAM BODY: ' + chunk.toString());
				res.end("Got instagram data and sent to all clients");
				// OK, so Instagram doesn't send enough information
				// in the update messages, so we have to re-search

				// TODO: Add in throttling

				instagramSearch(true);
				

				// This is old code that assumed Instagram provided
				// the data in the updates
				// Instead, all it provides is a watermark:
				// [{"changed_aspect": "media", "object": "tag", "object_id": "love", "time": 1400731745, "subscription_id": 4958586, "data": {}}]
				/*
				res.end("THANKS!");
				var body = JSON.parse(chunk.toString());
				if(body.data){
					_.forEach(body.data, function(elem){
						cache.counts.instagram++;
						data_cache.instagram.push(elem);
					});

					checkInstagramCache();
				}
				io.sockets.emit('instagram', body);
				console.log("Sending update to everyone");
				*/
			} catch (e){
				console.log("err handling instagram inbound: " + e);
			}
		});
	}
}

function instagramSearch(shouldUpdate){

	var tagsearch = 'https://api.instagram.com/v1/tags/' + cache.settings.tag + '/media/recent?client_id=5b77c97181bf4089a71f7a44ce752122';

	request(tagsearch, function (error, response, body) {
	  if (!error && response.statusCode == 200) {
	  	cache.lasts.instagramSearch = moment();
	  	data_cache.instagram = body;
	  	if(body.data){
	  		cache.counts.instagram = body.data.length || 0;
	  	} else {
	  		cache.counts.instagram = 0;
	  	}

	  	if(shouldUpdate){
	  		io.sockets.emit('instagram', data_cache.instagram);
	  	}
	  }
	  else
	  {
	  	console.log(error);
	  }
	});
};

var instagramCommandUrl = "https://api.instagram.com/v1/subscriptions/";

function startInstagramStream(){
	var instagramStreamForm = {
		'client_id':'8344cc32e0464b3db83b13575741d9cb',
		'client_secret':'d135ec98c4a04df7866e2a6201d7f356',
		'object':'tag',
		'aspect':'media',
		'object_id': cache.settings.tag.toString(),
		'callback_url':'http://whispering-everglades-6142.herokuapp.com/instagram'
	};
	//console.log(instagramStreamForm);
	request.post(instagramCommandUrl, function (error, response, body) {
	  if (!error && response.statusCode == 200) {
	  	console.log("Instagram stream enabled");
	  	console.log(body);
	  	cache.statuses.instagram_stream = true;
	  }
	  else
	  {
	  	console.log("Instagram stream failed to start");
	  	console.log(error);
	  	cache.statuses.instagram_stream = false;
	  }
	}).form(instagramStreamForm);     
}

function stopInstagramStream(){
	request.del(instagramCommandUrl + "?" + "client_secret=d135ec98c4a04df7866e2a6201d7f356&object=all&client_id=8344cc32e0464b3db83b13575741d9cb", function (error, response, body) {
	  if (!error && response.statusCode == 200) {
	  	console.log("Instagram stream stopped");
	  	console.log(body);
	  	cache.statuses.instagram_stream = false;
	  }
	  else
	  {
	  	console.log("Instagram stream failed to stop");
	  	console.log(error);
	  	cache.statuses.instagram_stream = true;
	  }
	}); 
}



//////////////////////////////////
// Twitter
/////////////////////////////////

var twitter_config = {
    consumer_key: 'bTVA9hrjxVEQ1on14lhUdjIKk',
    consumer_secret: 'xKCWoEGoBqWzUtX6kHv5LOI99f4BhUaCUpPgNv4r1G6UjE7ovx',
    access_token_key: '2495773801-qSTk9wtEO8H3I4fd9Lw2kICXwocPbeHvO7y1RxK',
    access_token_secret: 'xP6PeNoCcEft1sGVytIkq8JZC0OxMAuDwT7TT39ghfP1k'
};
// Twitter REST API
var twitter 		= require('twitter');
var twit = new twitter(twitter_config);

function twitterSearch(){
	twit.search(cache.settings.tag, function(data) {
	    console.log("Got twitter search results");
	    cache.lasts.twitterSearch = moment();
	    data_cache.twitter = data.statuses;
	    cache.counts.twitter = data.statuses.length || 0;
	});
};

// Twitter User-Stream for Streaming API
var Stream = require('user-stream');

function startTwitterStream(){
	
	data_cache.twitterStream = new Stream(twitter_config);

	var streamParams = {
	    track: cache.settings.tag
	};

	data_cache.twitterStream.on('data', function(json) {
		console.log("Got twitter updates");
		if(json){
			if(json.friends){
				console.log("Skipping twitter update about friends");
			} else if(json.text) { // "text" is an attribute that is only present in tweets
				data_cache.twitter.push(json);
				cache.counts.twitter++;
				checkTwitterCache();
				// tell everyone about this now
				io.sockets.emit('twitter', json); 
			}
			else
			{
				//console.log("Skipping twitter update about else condition");
			}
		}
	});

	// start the stream
	data_cache.twitterStream.stream(streamParams);
	console.log("Listening for twitter events");
	cache.statuses.twitter_stream = true;
}

function stopTwitterStream(){
	if(data_cache.twitterStream){
		data_cache.twitterStream.destroy();
	}
	console.log("No longer listening for twitter events");
	cache.statuses.twitter_stream = false;
}

