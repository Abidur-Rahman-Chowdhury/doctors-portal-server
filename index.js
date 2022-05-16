const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config(); 
const port = process.env.PORT || 5000;

const  app = express();

// middleware 
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send('Server is Running');
}
)   
function verifyJWT(req, res, next) {
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).send({message: 'Unauthorized Access'})
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded)=> {
        if (err) {
            return res.status(403).send({message: 'Forbidden Access'})
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.o1zdi.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
async function run() {
    try {
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
            const service = await cursor.toArray();
            res.send(service);
        })
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find({}).toArray();
            res.send(users)
        })
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            console.log(isAdmin);
            res.send({ admin:isAdmin})
        })
        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
          
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);    
            }
            else {
                res.status(403).send({message:'Forbidden'})
            }

            
           
        })
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const option = { upsert: true };
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(filter, updateDoc, option);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            })
            res.send({result,token});

        })
        // Warning:
        //  this is not the proper  way to query 
        // after learning more about mongodb use aggregate lookup,pipeline, match , group
        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 13, 2022';

            // step 1 : get all services

            const services = await servicesCollection.find().toArray();

            // step 2: get the booking of that date . output: [{},{},{},{},{}]

            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each service ,
            services.forEach(service => {
                // step:4 find bookings for that service. output: [{},{},{},{}] 
                const serviceBookings = bookings.filter(b => b.treatment === service.name);
                // step 5: selects slots for the service bookings: ['' , '','','' ] 
                const booked = serviceBookings.map(s => s.slot);
                // step 6: select those slots that are not in booked 
                const available = service.slots.filter(s => !booked.includes(s));
                //  step 7  set available to slots to make it easier
                service.slots = available;
            })
            res.send(services)
        })
      /**
       * API Naming Convention 
       * app.get('/booking') get all bookings in this collection. or get more than one or by filter
       * app.get('/booking/:id') get specific booking
       * app.post('/booking') add new booking
       * app.patch('/booking/:id') update with id
       * app.put('/booking/:id') //upsert ==> update if(exists) or insert (if doesn't exist)
       * app.delete('/booking/:id') delete specific  with id
       * 
       * 
      */
        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {

                return res.status(403).send({ message: 'Forbidden Access' });
            }
            
           
        })
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({success:false, booking:exists})
            }
            const result = await bookingCollection.insertOne(booking);
          return  res.send({ success:true, result});
        })
        
    } finally {
        
    }
}
run().catch(console.dir);

app.listen(port,() => {
    console.log('listening port', port);
})