import React from 'react';
import { useNavigate } from 'react-router-dom';
import './VerificationRequired.css';

function VerificationRequired() {
    const navigate = useNavigate();

    return (
        <div className="verification-required-container">
            <div className="verification-required-card">
                <div className="verification-icon">🔒</div>
                <h2>Verification Required</h2>
                <p>
                    To access the financial features of CryptoX Exchange, you need to complete your account verification.
                </p>
                <div className="verification-info">
                    <h3>Why verification is needed:</h3>
                    <ul>
                        <li>To comply with financial regulations</li>
                        <li>To protect your account against unauthorized access</li>
                        <li>To enable all trading, deposit, and withdrawal features</li>
                    </ul>
                </div>
                <div className="verification-actions">
                    <button
                        className="primary-button"
                        onClick={() => navigate('/document-upload')}
                    >
                        Complete Verification
                    </button>
                    <button
                        className="secondary-button"
                        onClick={() => navigate('/dashboard')}
                    >
                        Return to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}

export default VerificationRequired;