import React from 'react';
import { FileText } from 'lucide-react';

export default function Header() {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <FileText size={32} />
        <div>
          <h1 className="text-3xl font-bold">Quotation Management System</h1>
          <p className="text-blue-100">Manage customers, items, and create quotations easily</p>
        </div>
      </div>
    </div>
  );
}