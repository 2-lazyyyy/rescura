import { Heart, Shield, AlertTriangle, Settings, Lock } from "lucide-react";

export interface SafetyModule {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  content: string;
  quiz?: { question: string; options: string[]; answer: string }[];
  qna?: { question: string; answer: string }[];
}

export const mockSafetyModules: SafetyModule[] = [
  {
    id: "1",
    title: "CPR Training",
    description: "Learn life-saving cardiopulmonary resuscitation techniques",
    category: "First Aid",
    icon: <Heart className="w-6 h-6 text-red-500" />,
    content: "Cardiopulmonary resuscitation (CPR) is a life-saving technique useful in many emergencies, including a heart attack or near drowning, in which someone's breathing or heartbeat has stopped. The American Heart Association recommends that everyone — untrained bystanders and medical personnel alike — begin CPR with chest compressions.\n\nSteps:\n1. Check the scene and the person.\n2. Call for help.\n3. Open the airway.\n4. Check for breathing.\n5. Push hard, push fast (Chest Compressions).\n6. Deliver rescue breaths.",
    quiz: [
      {
        question: "What is the first step in CPR?",
        options: [
          "Call 911",
          "Check pulse",
          "Give breaths",
          "Chest compressions",
        ],
        answer: "Check pulse",
      },
      {
        question: "How deep should chest compressions be?",
        options: ["1 inch", "2 inches", "3 inches", "4 inches"],
        answer: "2 inches",
      },
    ],
    qna: [
      { question: "Can anyone perform CPR?", answer: "Yes, after training." },
      {
        question: "How often should CPR be updated?",
        answer: "Every 2 years.",
      },
    ],
  },
  {
    id: "2",
    title: "First Aid Basics",
    description: "Essential first aid skills for emergency situations",
    category: "First Aid",
    icon: <Shield className="w-6 h-6 text-blue-500" />,
    content: "First aid is the first and immediate assistance given to any person suffering from either a minor or serious illness or injury, with care provided to preserve life, prevent the condition from worsening, or to promote recovery.\n\nKey skills include:\n- Assessing the situation for safety.\n- Calling emergency services.\n- Controlling bleeding with pressure.\n- Managing shock by keeping the victim warm and calm.",
    quiz: [
      {
        question: "What should you do for a minor cut?",
        options: [
          "Wash, disinfect, cover",
          "Ignore",
          "Apply ointment only",
          "Call 911",
        ],
        answer: "Wash, disinfect, cover",
      },
    ],
    qna: [
      { question: "Do you need gloves?", answer: "Yes, to avoid infection." },
    ],
  },
  {
    id: "3",
    title: "Earthquake Safety",
    description: "What to do before, during, and after an earthquake",
    category: "Emergency",
    icon: <AlertTriangle className="w-6 h-6 text-orange-500" />,
    content: "Earthquakes are sudden, rapid shaking of the ground, caused by the shifting of tectonic plates under the Earth's surface. They can happen without warning.\n\nSafety protocol:\n- DROP down onto your hands and knees.\n- COVER your head and neck under a sturdy table or desk.\n- HOLD ON to your shelter until the shaking stops.\n- AFTER the shaking: Check for injuries and follow evacuation routes.",
    quiz: [],
    qna: [],
  },
];
