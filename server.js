var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
  , fs = require('fs');

var url = require('url');

app.listen(8080);

function handler (req, res) {
	var u = url.parse(req.url, true);
	var utest = u.pathname.toString();
	console.log("Pathname = '" + utest + "'");
	console.log("Equals1 = '" + (utest == "/") + "'");

	if(utest == "/"){
		console.log("Serving index file");
		fs.readFile(__dirname + '/index.html',
		  function (err, data) {
		    if (err) {
		      res.writeHead(500);
		      return res.end('Error loading index.html');
		    }

		    res.writeHead(200);
		    res.end(data);
		  });
	} else if (utest == '/instagram')
	{
		if(u.query && u.query["hub.mode"])
		{
			res.end(u.query["hub.challenge"]);
		}
		else
		{
			//res.setEncoding('utf8');
			console.log("Waiting for data to process the instagram post");
			req.on('data', function (chunk) {
				console.log('BODY: ' + chunk);
				console.log("Sending update to everyone");
				io.sockets.emit('instragram', chunk);
				res.end("Got instagram data and sent to all clients");
			});
		}
		
	}
	else
	{
		console.log("Ignoring other requests");
	}
}

io.sockets.on('connection', function (socket) {
	console.log("Making request");
	request('http://www.google.com', function (error, response, body) {
	  if (!error && response.statusCode == 200) {
	    //console.log(body) // Print the google web page.
		//socket.emit('listing', {data: body});    
	  }
	  else
	  {
	  	socket.emit('news', error);
	  }
	});

  socket.emit('news', { hello: 'world' });
  socket.on('my other event', function (data) {
    //console.log(data);
  });
});

var request = require('request');