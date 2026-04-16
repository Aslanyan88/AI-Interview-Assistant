"use client";

const TYPES = [
  { id: "software-engineering", name: "Software Engineering", icon: "💻" },
  { id: "data-science", name: "Data Science & ML", icon: "📊" },
  { id: "product-management", name: "Product Management", icon: "📦" },
  { id: "behavioral", name: "Behavioral / Leadership", icon: "🤝" },
  { id: "system-design", name: "System Design", icon: "🏗️" },
  { id: "devops", name: "DevOps & Cloud", icon: "☁️" },
  { id: "frontend", name: "Frontend Engineering", icon: "🎨" },
  { id: "general", name: "General Interview", icon: "💼" },
  { id: "custom", name: "Custom", icon: "⚙️" },
];

export default function InterviewSetup({ interviewType, setInterviewType, customContext, setCustomContext }) {
  // localStorage persistence is handled by page.js with hydration guard

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="font-semibold text-gray-200">Interview Type</h2>
        <p className="text-xs text-gray-500 mt-0.5">Select the role type to get tailored coaching. Add context for even better suggestions.</p>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Type grid ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setInterviewType(t.id)}
              className={`p-2.5 rounded-lg border text-center text-sm transition-all ${
                interviewType === t.id
                  ? "border-emerald-500 bg-emerald-900/20 text-emerald-300"
                  : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              <span className="text-lg block">{t.icon}</span>
              <span className="text-xs block mt-1 leading-tight">{t.name}</span>
            </button>
          ))}
        </div>

        {/* ── Custom context ───────────────────────────────────────────── */}
        <div>
          <label className="text-sm font-medium text-gray-300 mb-1.5 block">
            Additional Context <span className="text-gray-600 font-normal">(optional)</span>
          </label>
          <textarea
            value={customContext}
            onChange={(e) => setCustomContext(e.target.value)}
            placeholder={"Paste your job description, key resume points, or any context that will help the AI give better suggestions...\n\nExample:\n- Applying for Senior React Developer at Stripe\n- 5 years experience with TypeScript and React\n- Focus on system design and performance"}
            rows={4}
            className="w-full py-2 px-3 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-y placeholder:text-gray-600"
          />
        </div>
      </div>
    </div>
  );
}
