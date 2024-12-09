import React, { useState } from 'react';
//import logo from './logo.svg';
import './App.css';
//import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './components/Login/login';
import Home from './components/Home/home';
import Signup from './components/Signup/signup';
import Health from './components/Health/health';
import Book from './components/Book/book';
import BrowseSer from './components/BrowseSer/browse'

function App() {
    return (
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/home" element={<Home />} />
          <Route path="/health"element={<Health/>} />
          <Route path="/book" element={<Book />} />
          <Route path="/browse" element={<BrowseSer/>}/>
            
        </Routes>
      </Router>
    );
  }
  

export default App;