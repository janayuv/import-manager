# Unhandled error in stream pipeline
In Node.js, calling the `pipe()` method on a stream without proper error handling can lead to unexplained failures, where errors are dropped and not propagated downstream. This can result in unwanted behavior and make debugging difficult. To reliably handle all errors, every stream in the pipeline must have an error handler registered.


## Recommendation
Instead of using `pipe()` with manual error handling, prefer using the `pipeline` function from the Node.js `stream` module. The `pipeline` function automatically handles errors and ensures proper cleanup of resources. This approach is more robust and eliminates the risk of forgetting to handle errors.

If you must use `pipe()`, always attach an error handler to the source stream using methods like `on('error', handler)` to ensure that any errors emitted by the input stream are properly handled. When multiple `pipe()` calls are chained, an error handler should be attached before each step of the pipeline.


## Example
The following code snippet demonstrates a problematic usage of the `pipe()` method without error handling:


```javascript
const fs = require('fs');
const source = fs.createReadStream('source.txt');
const destination = fs.createWriteStream('destination.txt');

// Bad: Only destination has error handling, source errors are unhandled
source.pipe(destination).on('error', (err) => {
  console.error('Destination error:', err);
});

```
A better approach is to use the `pipeline` function, which automatically handles errors:


```javascript
const { pipeline } = require('stream');
const fs = require('fs');
const source = fs.createReadStream('source.txt');
const destination = fs.createWriteStream('destination.txt');

// Good: Using pipeline for automatic error handling
pipeline(
  source,
  destination,
  (err) => {
    if (err) {
      console.error('Pipeline failed:', err);
    } else {
      console.log('Pipeline succeeded');
    }
  }
);

```
Alternatively, if you need to use `pipe()`, make sure to add error handling:


```javascript
const fs = require('fs');
const source = fs.createReadStream('source.txt');
const destination = fs.createWriteStream('destination.txt');

// Alternative Good: Manual error handling with pipe()
source.on('error', (err) => {
  console.error('Source stream error:', err);
  destination.destroy(err);
});

destination.on('error', (err) => {
  console.error('Destination stream error:', err);
  source.destroy(err);
});

source.pipe(destination);

```

## References
* Node.js Documentation: [stream.pipeline()](https://nodejs.org/api/stream.html#streampipelinestreams-callback).
