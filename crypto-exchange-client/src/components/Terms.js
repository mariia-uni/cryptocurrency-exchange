import React from 'react';
import { Link } from 'react-router-dom';
import './StaticPages.css';

function Terms() {
    return (
        <div className="static-page-container">
            <div className="static-page-content">
                <h1>Terms of Service</h1>
                <p className="last-updated">Last updated: May 13, 2025</p>

                <section>
                    <h2>1. Introduction</h2>
                    <p>Welcome to CryptoX Simulator. These Terms of Service govern your use of our platform, which is a simulated cryptocurrency exchange designed for educational and demonstration purposes only. No real money or blockchain technology is used.</p>
                </section>

                <section>
                    <h2>2. Acceptance of Terms</h2>
                    <p>By accessing or using our simulation services, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, you should not use the platform.</p>
                </section>

                <section>
                    <h2>3. Eligibility</h2>
                    <p>You must be at least 18 years old or the age of majority in your jurisdiction to use our simulator. The platform is intended for educational use only and does not involve actual financial transactions.</p>
                </section>

                <section>
                    <h2>4. Simulated Trading Rules</h2>
                    <p>All trades executed on the platform are virtual and have no real-world value. You agree to use the simulator ethically and in accordance with its educational purpose.</p>
                </section>

                <section>
                    <h2>5. No Real Verification</h2>
                    <p>CryptoX Simulator does not perform real identity verification or comply with KYC/AML regulations, as no actual funds or user identities are involved. Any user data provided is for simulation purposes only.</p>
                </section>

                <section>
                    <h2>6. No Real Fees</h2>
                    <p>There are no real transaction or withdrawal fees. Any fee structures shown within the simulator are fictional and included solely for realism and educational value.</p>
                </section>

                <section>
                    <h2>7. Account Responsibility</h2>
                    <p>You are responsible for maintaining the confidentiality of your simulated account credentials and for any activity that occurs under your account.</p>
                </section>

                <section>
                    <h2>8. Termination</h2>
                    <p>We reserve the right to suspend or terminate access to the simulator at any time, especially in cases of misuse or behavior inconsistent with the platform’s educational intent.</p>
                </section>

                <section>
                    <h2>9. Changes to Terms</h2>
                    <p>We may update these Terms from time to time. Continued use of the simulator after changes are posted constitutes your acceptance of the revised terms.</p>
                </section>

                <section>
                    <h2>10. Contact Us</h2>
                    <p>If you have any questions about these Terms, please contact us at support@cryptox.com</p>
                </section>

                <div className="static-page-footer">
                    <Link to="/dashboard">Home</Link>
                    <Link to="/about">About Us</Link>
                    <Link to="/privacy">Privacy Policy</Link>
                    <Link to="/support">Contact Support</Link>
                </div>
            </div>
        </div>
    );
}

export default Terms;