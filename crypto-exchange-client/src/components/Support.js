import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './StaticPages.css';

function Support() {
    const [contactForm, setContactForm] = useState({
        name: '',
        email: '',
        subject: '',
        message: ''
    });
    const [submitted, setSubmitted] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setContactForm({
            ...contactForm,
            [name]: value
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Here you would normally send the form data to your backend
        console.log('Support request submitted:', contactForm);
        setSubmitted(true);
    };

    return (
        <div className="static-page-container">
            <div className="static-page-content">
                <h1>Customer Support</h1>

                <div className="support-sections">
                    <div className="faq-section">
                        <h2>Frequently Asked Questions</h2>

                        <div className="faq-item">
                            <h3>How do I create an account?</h3>
                            <p>To get started, click on the “Sign Up” button at the top of the page and follow the quick registration steps. No personal or financial information is required — it's all simulation-based.</p>
                        </div>

                        <div className="faq-item">
                            <h3>Do I need to verify my identity?</h3>
                            <p>Basic verification is instant. ID verification typically takes 1-3 business days to complete.</p>
                        </div>

                        <div className="faq-item">
                            <h3>How do I deposit funds?</h3>
                            <p>This platform uses virtual funds for educational purposes. After logging in, click on the “Deposit” button to receive simulated credits you can use to practice trading.</p>
                        </div>

                        <div className="faq-item">
                            <h3>Are there trading fees?</h3>
                            <p>Our trading simulator mimics real-world fee structures. Simulated fees start at 0.1%, helping users understand how costs can affect trading outcomes — all without spending actual money.</p>
                        </div>
                    </div>

                    {!submitted ? (
                        <div className="contact-form-section">
                            <h2>Contact Us</h2>
                            <p>If you couldn't find an answer to your question, please fill out the form below:</p>

                            <form onSubmit={handleSubmit} className="contact-form">
                                <div className="form-group">
                                    <label htmlFor="name">Name</label>
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        value={contactForm.name}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="email">Email</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={contactForm.email}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="subject">Subject</label>
                                    <input
                                        type="text"
                                        id="subject"
                                        name="subject"
                                        value={contactForm.subject}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="message">Message</label>
                                    <textarea
                                        id="message"
                                        name="message"
                                        value={contactForm.message}
                                        onChange={handleChange}
                                        rows="5"
                                        required
                                    ></textarea>
                                </div>

                                <button type="submit" className="submit-button">Submit</button>
                            </form>
                        </div>
                    ) : (
                        <div className="thank-you-message">
                            <h2>Thank You!</h2>
                            <p>We've received your message and will respond to your inquiry within 24 hours.</p>
                        </div>
                    )}
                </div>

                <div className="support-info">
                    <h2>Other Ways to Reach Us</h2>
                    <div className="contact-methods">
                        <div className="contact-method">
                            <h3>Email Support</h3>
                            <p>support@cryptox.com</p>
                        </div>
                        <div className="contact-method">
                            <h3>Phone Support</h3>
                            <p>+1 (555) 123-4567</p>
                            <p className="support-hours">Available Mon-Fri, 9AM-5PM EST</p>
                        </div>
                    </div>
                </div>
                <div className="static-page-footer">
                    <Link to="/dashboard">Home</Link>
                    <Link to="/about">About Us</Link>
                    <Link to="/terms">Terms of Service</Link>
                    <Link to="/privacy">Privacy Policy</Link>
                </div>
            </div>
        </div>
    );
}

export default Support;