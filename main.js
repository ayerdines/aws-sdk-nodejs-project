// Please use this code with great care, it might result in adding default encryption policy to unwanted buckets, encrypting unwanted objects

const AWS = require('aws-sdk');


// records total unencrypted objects present in S3
var unencrypted_objects = 0;

// records total already encrypted objects present in S3
var already_encrypted_objects = 0;

// records total objects encrypted with this script
var objects_encrypted = 0;



var delete_encryption = async (bucket_name) => {
    var params = {
        Bucket: bucket_name /* required */
    };
    s3.deleteBucketEncryption(params, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else console.log(data);           // successful response
    });
};

var list_buckets = async () => {
    return await s3.listBuckets().promise();
};

var list_objects = async (bucket_name, token = null) => {
    var params = {
        Bucket: bucket_name, /* required */
        ContinuationToken: token,
    };
    return await s3.listObjectsV2(params).promise();
};


var put_encryption = async (bucket_name)=> {
    var params = {
        Bucket: bucket_name, /* required */
        ServerSideEncryptionConfiguration: { /* required */
            Rules: [ /* required */
                {
                    ApplyServerSideEncryptionByDefault: {
                        SSEAlgorithm: 'AES256', /* required */
                    }
                }
            ]
        },
    };
    return await s3.putBucketEncryption(params).promise();
};

var get_encryption = async (bucket_name)=> {
    var params = {
        Bucket: bucket_name /* required */
    };
    return await s3.getBucketEncryption(params).promise();
};

var copy_object = async (bucket_name, key) => {
    try {
        // get object Metadata to check if it's encrypted
        var headData = await s3.headObject({
            Bucket: bucket_name,
            Key: key
        }).promise();

        // if not encrypted
        if (!headData.ServerSideEncryption) {
            unencrypted_objects += 1;
            // comment out the following lines if you want to make encrypted copy of an object over itself
            // copy file over itself with encryption
            await s3.copyObject({
                Bucket: bucket_name,
                CopySource: '/' + bucket_name + '/' + key,
                Key: key,
                ServerSideEncryption: 'AES256'
            }).promise();

            // verify file is now encrypted server-side
            var data = await s3.headObject({
                Bucket: bucket_name,
                Key: key
            }).promise();
            objects_encrypted += !!data.ServerSideEncryption ? 1 : 0;

            return Promise.resolve(!!data.ServerSideEncryption);
        } else {
            already_encrypted_objects += 1;
            return Promise.reject(`Object with key ${key} of bucket ${bucket_name} is already encrypted.`);
        }
    } catch (e) {
        return Promise.reject(e);
    }
};

let s3 = new AWS.S3({apiVersion: '2006-03-01', accessKeyId: 'ACCESS_KEY', secretAccessKey: 'SECRET_ACCESS_KEY', signatureVersion: 'v4'});
list_buckets().then(function (data) {
    for (const bucket of data.Buckets) {
        // if you want to work on a single bucket comment out the following line
        // if (bucket.Name === 'BUCKET_NAME') {
        get_encryption(bucket.Name).then(function(data){
            console.log(`Bucket ${bucket.Name} has Default Encryption Policy enabled, so copying an object over itself will encrypt the object.`);
            var token = null;
            do {
                list_objects(bucket.Name, token).then(function (data) {
                    for (const object of data.Contents) {
                        if (!object.Key.endsWith('/')) {
                            copy_object(bucket.Name, object.Key).then(function (data) {
                                console.log(`Key ${object.Key} of bucket ${bucket.Name} is encrypted? ${data}`);
                            }).catch(function (err) {
                                console.log(err);
                            });
                        }
                    }
                    if (data.IsTruncated) {
                        token = data.NextContinuationToken;
                    } else {
                        token = null;
                    }
                }).catch(function (err) {
                    console.log(err);
                });
            } while (token);
        }).catch(function (err) {
                console.log(`Bucket ${bucket.Name} has no Default Encryption Policy enabled, so lets enable it first.`);
                // add default encryption policy to the bucket, after this copying the object over itself will encrypt the object
                put_encryption(bucket.Name).then(function (data) {
                    console.log(`Successfully added default encryption policy to bucket ${bucket.Name}`);
                    console.log(`Now, copying an object over itself will encrypt the object.`);
                    var token = null;
                    do {
                        list_objects(bucket.Name, token).then(function (data) {
                            for (const object of data.Contents) {
                                if (!object.Key.endsWith('/')) {
                                    copy_object(bucket.Name, object.Key).then(function (data) {
                                        console.log(`Key ${object.Key} of bucket ${bucket.Name} is encrypted? ${data}`);
                                    }).catch(function (err) {
                                        console.log(err);
                                    });
                                }
                            }
                        });
                        token = data.NextContinuationToken;
                    } while (token);
                }).catch(function (err) {
                    console.log(`Unable to add Default Encryption Policy to bucket ${bucket.Name} due to error ${err}`);
                });
            }
        );
        // }
    }
    console.log(`Total unencrypted objects present in S3 before running this script: ${unencrypted_objects}`);
    console.log(`Total already encrypted objects present in S3 before running this script: ${already_encrypted_objects}`);
    console.log(`Total objects encrypted by this script: ${unencrypted_objects}`);
}).catch(function (err) {
    console.error(err, err.stack);
});
// delete_encryption('BUCKET_NAME');
// get_encryption('BUCKET_NAME').then(function (data) {
//     console.log(data);
// }).catch(function (err) {
//     console.log(err);
// });