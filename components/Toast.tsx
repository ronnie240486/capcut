
import React, { useEffect } from 'react';

export interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
    onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bgColors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        info: 'bg-blue-600'
    };

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    return (
        <div className={`fixed top-4 right-4 z-[10000] flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl text-white transform transition-all duration-300 animate-in slide-in-from-right-10 ${bgColors[type]}`}>
            <i className={`fas ${icons[type]} text-lg`}></i>
            <span className="text-sm font-medium">{message}</span>
            <button onClick={onClose} className="ml-2 hover:opacity-75">
                <i className="fas fa-times"></i>
            </button>
        </div>
    );
};
