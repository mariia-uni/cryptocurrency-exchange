import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

const VerifiedRoute = ({ children }) => {
    const [verificationStatus, setVerificationStatus] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkVerification = async () => {
            try {
                const token = localStorage.getItem('auth_token');

                if (!token) {
                    setIsLoading(false);
                    return;
                }

                // Fetch verification status
                const response = await fetch('http://localhost:8080/verify/status', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    setVerificationStatus(data);
                } else {
                    console.warn(`Failed to fetch verification status: ${response.status}`);
                    setVerificationStatus({ status: 'unknown' });
                }
            } catch (error) {
                console.error('Error checking verification status:', error);
                setVerificationStatus({ status: 'unknown' });
            } finally {
                setIsLoading(false);
            }
        };

        checkVerification();
    }, []);

    const token = localStorage.getItem('auth_token');

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    if (isLoading) {
        return <div className="loading">Checking verification status...</div>;
    }

    // FIXED: Updated verification check to match the structure in Dashboard.js
    const isVerified = verificationStatus &&
        verificationStatus.verification &&
        verificationStatus.verification.id_document &&
        verificationStatus.verification.id_document.id_verification_status === 'approved';

    if (!isVerified) {
        return <Navigate to="/verify-required" replace />;
    }

    return children;
};

export default VerifiedRoute;