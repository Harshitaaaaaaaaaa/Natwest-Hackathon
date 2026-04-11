import React, { useState } from 'react';
import { useAppContext } from '../stores/appStore';
import { ArrowRight, Database } from 'lucide-react';

export const Login: React.FC = () => {
  const { loginUser } = useAppContext();
  const [username, setUsername] = useState('');
  const [isHovered, setIsHovered] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim().length > 0) {
      loginUser(username.trim());
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-blue-50 via-slate-50 to-violet-50">
      {/* Background glowing orbits matching the main app layout */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-400/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-violet-400/20 rounded-full blur-[80px] pointer-events-none" />
      
      <div className="z-10 w-full max-w-md p-10 glass-card-high rounded-[2rem] border border-white flex flex-col relative shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="flex flex-col items-center mb-10 relative">
          <div className="w-20 h-20 rounded-2xl glass-card flex items-center justify-center mb-6 shadow-sm pulse-glow">
            <Database className="w-10 h-10 text-blue-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-800">
            Talk2Data
          </h1>
          <p className="text-slate-500 mt-3 text-center text-sm font-light leading-relaxed">
            Enter your User ID to load your personalized content and conversational history.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="relative group">
            <input
              type="text"
              id="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-white/60 border border-slate-200/60 rounded-xl px-5 py-4 text-slate-700 placeholder:text-transparent focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-all peer font-medium"
              placeholder="User ID or Name"
            />
            {/* Smooth floating label matching light aesthetic */}
            <label
              htmlFor="username"
              className="absolute text-sm text-slate-400 duration-300 transform -translate-y-4 scale-[0.85] top-2 z-10 origin-[0] bg-transparent px-1 peer-focus:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-[0.85] peer-focus:-translate-y-4 left-4 pointer-events-none"
            >
              User ID or Name
            </label>
          </div>

          <button
            type="submit"
            className="w-full relative py-4 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2.5 overflow-hidden group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <span className="relative z-10 flex items-center gap-2">
              Continue to Data
              <ArrowRight className={`w-4 h-4 transition-transform duration-300 ${isHovered ? 'translate-x-1' : ''}`} />
            </span>
          </button>
        </form>
      </div>
      
      <div className="mt-8 text-slate-400 text-xs font-medium">
        System secured for authorized personnel only.
      </div>
    </div>
  );
};
