import React from 'react';
import { Link } from 'react-router-dom';
import './StaticPages.css';

function Privacy() {
    return (
        <div className="static-page-container">
            <div className="static-page-content">
                <h1>Privacy Policy</h1>
                <p className="last-updated">Last updated: May 13, 2025</p>

                <section>
                    <h2>1. Introduction</h2>
                    <p>Your privacy is important to us. This Privacy Policy explains how CryptoX Simulator collects, uses, and protects your information while you interact with our educational cryptocurrency-exchange simulator. Please note: our platform does not involve real money, real cryptocurrency transactions, or real blockchain technology.</p>
                </section>

                <section>
                    <h2>2. Information We Collect</h2>
                    <p>We may collect basic personal information such as your name, email address, and username to create and manage your simulator account. No financial data or official identification documents are required, as this is a training environment.</p>
                </section>

                <section>
                    <h2>3. How We Use Your Information</h2>
                    <p>We use your information to provide access to the simulator features, track your progress and performance within the simulated environment, improve our platform’s usability and educational value, improve our platform, and communicate with you about updates and support.</p>
                </section>

                <section>
                    <h2>4. Data Security</h2>
                    <p>We implement appropriate technical and organizational measures to protect your data against unauthorized access, loss, or misuse.</p>
                </section>

                <section>
                    <h2>5. Cookies and Analytics</h2>
                    <p>We use cookies and similar technologies to understand how users interact with our platform and to enhance your experience. This may include usage data to help us improve simulator features and user flow.</p>
                </section>

                <section>
                    <h2>6. Third-Party Sharing</h2>
                    <p>We do not share your personal information with any third parties for financial, regulatory, or identity verification purposes, as no real transactions are conducted. Limited data may be shared with analytics providers to enhance the simulator experience.</p>
                </section>

                <section>
                    <h2>7. Your Rights</h2>
                    <p>You have the right to access, correct, and request deletion of your personal information, subject to legal requirements.</p>
                </section>

                <section>
                    <h2>8. Changes to Privacy Policy</h2>
                    <p>We may update this Privacy Policy from time to time. We will notify you of any significant changes.</p>
                </section>

                <section>
                    <h2>9. Contact Us</h2>
                    <p>If you have questions about this Privacy Policy, please contact us at privacy@cryptox.com</p>
                </section>

                <div className="static-page-footer">
                    <Link to="/dashboard">Home</Link>
                    <Link to="/about">About Us</Link>
                    <Link to="/terms">Terms of Service</Link>
                    <Link to="/support">Contact Support</Link>
                </div>
            </div>
        </div>
    );
}

export default Privacy;