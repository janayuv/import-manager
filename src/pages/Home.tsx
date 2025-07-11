// src/pages/Home.tsx
import React from "react";

export default function Home() {
  return (
    <div className="container mx-auto py-8">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((item) => (
          <div key={item} className="border rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">Summary {item}</h3>
            <p className="text-muted-foreground">
              Overview of important metrics and activities will appear here.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
