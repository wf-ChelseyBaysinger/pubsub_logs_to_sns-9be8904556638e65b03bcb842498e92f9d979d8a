// Include the cluster module
var cluster = require('cluster');
var port = process.env.PORT || 8080

// Code to run if we're in the master process
if (cluster.isMaster) {
    // Count the machine's CPUs
    var cpuCount = require('os').cpus().length;
    // Create a worker for each CPU
    for (var i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }
    // Listen for dying workers
    cluster.on('exit', function (worker) {
        // Replace the dead worker, we're not sentimental
        console.log('Worker ' + worker.id + ' died :(');
        cluster.fork();

    });
// Code to run if we're in a worker process
} else {
   var app = require('./express-app.js')
    // Bind to a port
    app.listen(port);
    // console.log('Worker ' + cluster.worker.id + ' running!');
}
