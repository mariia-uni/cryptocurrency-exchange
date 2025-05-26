import React from 'react';
import { Link } from 'react-router-dom';
import './StaticPages.css';

function About() {
  return (
    <div className="static-page-container">
      <div className="static-page-content">
        <h1>About CryptoX</h1>

        <section>
          <h2>Our Mission</h2>
          <p>CryptoX is a cryptocurrency exchange simulator built to help users understand and explore the world of crypto trading—without the risk of real money or blockchain transactions. Our mission is to provide a safe, educational, and realistic environment for learning how cryptocurrency exchanges work.</p>
          <p>Launched in 2025, CryptoX aims to bridge the gap between curiosity and confidence by offering a hands-on simulation of crypto trading in a fully controlled, risk-free setting.</p>
        </section>

        <section>
          <h2>What We Offer</h2>
          <p className="highlight-text">CryptoX provides a full-featured exchange simulation platform designed to help you practice trading strategies and gain experience:</p>
          <ul className="feature-list">
            <li>A realistic trading interface with simulated real-time market data</li>
            <li>Virtual wallets and assets—no real cryptocurrencies or blockchain involved</li>
            <li>Zero financial risk and no transaction fees</li>
            <li>An educational tool for schools, training programs, and self-learners</li>
          </ul>
        </section>

        <div className="static-page-footer">
          <Link to="/dashboard">Home</Link>
          <Link to="/terms">Terms of Service</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/support">Contact Support</Link>
        </div>
      </div>
    </div>
  );
}

export default About;