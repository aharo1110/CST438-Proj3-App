// simple node web server that displays hello world
// optimized for Docker image

const express = require("express");
// this example uses express web framework so we know what longer build times
// do and how Dockerfile layer ordering matters. If you mess up Dockerfile ordering
// you'll see long build times on every code change + build. If done correctly,
// code changes should be only a few seconds to build locally due to build cache.

const morgan = require("morgan");
// morgan provides easy logging for express, and by default it logs to stdout
// which is a best practice in Docker. Friends don't let friends code their apps to
// do app logging to files in containers.

const database = require("./database");

const passport = require("passport");
require('dotenv').config();

const cors = require("cors");
const session = require("express-session");

// Appi
const app = express();

app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());

require("./auth");

const knex = require("./database");
const jwt = require('jsonwebtoken');

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(morgan("common"));

// OAuth endpoints

app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/api/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  async (req, res) => {
    const { profile, isNew } = req.user;
    const token = jwt.sign({ profile, isNew }, process.env.JWT_SECRET, { expiresIn: '1h' });
    try {
      const user = await knex('users').where({ google_id: profile.id }).first();
      const logToken = jwt.sign({ user}, process.env.JWT_SECRET, { expiresIn: '1h' });

      if (isNew) {
        req.session.newUser = profile;
        res.redirect(`http://localhost:3000/signup?token=${token}`);
      } else {
        res.redirect(`http://localhost:3000/home?token=${logToken}`);
      }
    } catch (error) {
      console.error('Error storing user in session:', error);
      res.redirect('/');
    }
  }
);

app.get('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect('http://localhost:3000/');
  });
});

app.get("/", function(req, res, next) {
  database.raw('select VERSION() version')
    .then(([rows, columns]) => rows[0])
    .then((row) => res.json({ message: `Hello from MySQL ${row.version}` }))
    .catch(next);
});

// API endpoints

app.get("/api/auth/signup", (req, res) => {
  const token = req.query.token;
  console.log(token);
  if (!token) {
    return res.status(401).json({ message: 'Token is missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json(decoded.profile);
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  const {google_id, phone,
    pet_name, pet_type, pet_breed, pet_sex, pet_dob} = req.body;
    try {
      // Update user values
      await knex('users')
        .where({ google_id: google_id })
        .update({ phone: phone });
  
      const user = await knex('users')
        .where({ google_id: google_id })
        .select('user_id')
        .first();

      const user_id = user.user_id;
  
      // Insert pet values
      await knex('pets').insert({
        owner: user_id,
        name: pet_name,
        type: pet_type,
        breed: pet_breed,
        sex: pet_sex,
        dob: pet_dob
      });
      const token = jwt.sign({ user}, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.status(200).json({ message: "Signup successful", token: token });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ message: "Failed to create account. Please try again." });
    }
});

app.post('/api/make-admin', async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  try {
    await knex('users')
      .where({ user_id: user_id })
      .update({ is_admin: true });

    res.status(200).json({ message: `User with ID ${user_id} is now an admin.` });
  } catch (error) {
    console.error('Error making user admin:', error);
    res.status(500).json({ error: 'Failed to update user to admin.' });
  }
});


app.post("/api/pet", (req, res) => {
  const {owner, name, type, breed, sex, dob} = req.body;
  // Maybe check if owner exists?
  if(knex('users').where({ user_id: owner }).first() === undefined) {
    return res.status(400).json({ message: "Owner does not exist" });
  }
  knex('pets').insert({
    owner: owner,
    name: name,
    type: type,
    breed: breed,
    sex: sex,
    dob: dob
  })
  .then(() => {
    res.status(200).json({ message: "Pet added" });
  });
});

app.get("/api/pet", (req, res) => {
  if(req.query.owner) {
    knex('pets')
      .select('*')
      .where({ owner: req.query.owner })
      .then((rows) => {
        res.status(200).json(rows);
      });
  } else if(req.query.id) {
    knex('pets')
      .select('*')
      .where({ pet_id: req.query.id })
      .then((rows) => {
        res.status(200).json(rows);
      });
  } else {
    res.status(400).json({ message: "Missing query parameter" });
  }
});

app.get("/api/user", (req, res) => {
  if(req.query.id) {
    knex('users')
      .select('*')
      .where({ user_id: req.query.id })
      .then((rows) => {
        res.status(200).json(rows);
      });
  } else if(req.query.google_id) {
    knex('users')
      .select('*')
      .where({ google_id: req.query.google_id })
      .then((rows) => {
        res.status(200).json(rows);
      });
  } else {
    knex('users')
      .select('*')
      .then((rows) => {
        res.status(200).json(rows);
      });
  }
});

app.delete('/api/user/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    await knex('users').where('user_id', userId).del();
    res.status(200).json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

app.get("/api/service", (req, res) => {
  if(req.query.id) {
    knex('services')
      .select('*')
      .where({ service_id: req.query.id })
      .then((rows) => {
        res.status(200).json(rows);
      });
    } else if(req.query.type) {
      knex('services')
        .select('*')
        .where({ service_type: req.query.type })
        .then((rows) => {
          res.status(200).json(rows);
        });
  } else {
    knex('services')
      .select('*')
      .then((rows) => {
        res.status(200).json(rows);
      });
  }
});

app.post("/api/service", (req, res) => {
  let {name, description, service_type, address, city, state, zip,} = req.body;
  state = state.toUpperCase();
  knex('services').insert({
    name: name,
    description: description,
    service_type: service_type,
    address: address,
    city: city,
    state: state,
    zip: zip
  })
  .then(() => {
    res.status(200).json({ message: "Service added" });
  });
});

app.post("/api/appointments", (req, res) => {
  const { user_id, pet_id, service_id, appointment_date, appointment_time } = req.body;

  if (!user_id || !pet_id || !service_id || !appointment_date || !appointment_time) {
    return res.status(400).json({ error: "All fields are required." });
  }
  knex("appointments")
    .insert({
      user_id: user_id,
      pet_id: pet_id,
      service_id: service_id,
      appointment_date: appointment_date,
      appointment_time: appointment_time,
    })
    .then(([appointment_id]) => {
      res.status(201).json({
        message: "Appointment created successfully!",
        appointment_id: appointment_id,
      });
    })
    .catch((error) => {
      console.error("Error creating appointment:", error);
      res.status(500).json({ error: "Failed to create appointment. Please try again." });
    });
});

app.get("/api/appointments", (req, res) => {
  const { userId } = req.query.user_id;

  knex
    .select('appointments.appointment_id', 'pets.name', 'services.name', 'appointments.appointment_date', 'appointments.appointment_time')
    .from("appointments")
    .join("pets", {"appointments.pet_id": "pets.pet_id"})
    .join("services", {"appointments.service_id": "services.service_id"})
    .where({ "appointments.user_id": userId })
    .andWhere("appointments.appointment_date", ">=", knex.fn.now()) // doesnt pass past appointments
    .orderBy("appointments.appointment_date", "asc") // Sort by date
    .then((appointments) => {
      res.json(appointments);
    })
    .catch((error) => {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ error: "Failed to fetch appointments" });
    });
});



// Health checks/System stuff

app.get("/healthz", function(req, res) {
  // do app logic here to determine if app is truly healthy
  // you should return 200 if healthy, and anything else will fail
  // if you want, you should be able to restrict this to localhost (include ipv4 and ipv6)
  res.send("I am happy and healthy\n");
});

module.exports = app;