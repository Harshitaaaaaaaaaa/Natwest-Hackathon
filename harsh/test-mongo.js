import mongoose from 'mongoose';

const uriStr = process.argv[2];

console.log("Testing URI:", uriStr.replace(/:([^:@]+)@/, ':<hidden-password>@'));

mongoose.connect(uriStr, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log("SUCCESS! Connected to MongoDB.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("ERROR:");
    console.error(err.message);
    if (err.message.includes('bad auth')) {
      console.log("-> Diagnosis: Password or Username is incorrect. (Network is fine, connection made).");
    } else if (err.message.includes('timeout') || err.message.includes('queryTxt ETIMEOUT')) {
      console.log("-> Diagnosis: Network Access error (IP not whitelisted).");
    } else {
      console.log("-> Diagnosis: Unknown.");
    }
    process.exit(1);
  });
