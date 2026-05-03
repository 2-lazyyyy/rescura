export type SafetyLessonStep = {
  id: number
  title: string
  content: string
}

export type SafetyLessonRecord = {
  id: string
  moduleId: string
  title: string
  category: string
  duration: string
  rewardPoints: number
  steps: SafetyLessonStep[]
}

export const safetyLessons: SafetyLessonRecord[] = [
  {
    id: 'cpr-basics',
    moduleId: '1',
    title: 'CPR Training',
    category: 'First Aid',
    duration: '15 min',
    rewardPoints: 10,
    steps: [
      { id: 1, title: 'Check Responsiveness', content: 'Tap the person and ask loudly if they are okay. If no response, call emergency help immediately.' },
      { id: 2, title: 'Open Airway', content: 'Lay the person on a firm surface, tilt the head back slightly, and lift the chin to open the airway.' },
      { id: 3, title: 'Check Breathing', content: 'Look, listen, and feel for breathing for up to 10 seconds. If absent, start chest compressions.' },
      { id: 4, title: 'Chest Compressions', content: 'Place hands in the center of chest, push hard and fast at 100-120 compressions per minute.' },
      { id: 5, title: 'Continue Cycles', content: 'Continue CPR cycles until trained responders arrive or the person starts breathing normally.' },
    ],
  },
  {
    id: 'first-aid-basics',
    moduleId: '2',
    title: 'First Aid Basics',
    category: 'First Aid',
    duration: '20 min',
    rewardPoints: 10,
    steps: [
      { id: 1, title: 'Assess Safety', content: 'Before helping, ensure the scene is safe for both rescuer and victim.' },
      { id: 2, title: 'Call For Help', content: 'If injuries are serious, contact emergency services and share exact location details.' },
      { id: 3, title: 'Control Bleeding', content: 'Apply direct pressure with clean cloth and elevate injured area when possible.' },
      { id: 4, title: 'Treat For Shock', content: 'Lay person down, keep warm, and avoid giving food or drink until professionals arrive.' },
    ],
  },
  {
    id: 'earthquake-safety',
    moduleId: '3',
    title: 'Earthquake Safety',
    category: 'Emergency',
    duration: '10 min',
    rewardPoints: 10,
    steps: [
      { id: 1, title: 'Prepare Before Quake', content: 'Secure heavy objects, prepare emergency kit, and agree family meeting points.' },
      { id: 2, title: 'Drop', content: 'Drop to hands and knees as soon as shaking starts to prevent fall injuries.' },
      { id: 3, title: 'Cover', content: 'Cover head and neck, then move under sturdy furniture if possible.' },
      { id: 4, title: 'Hold On', content: 'Hold on until shaking stops and be ready for aftershocks.' },
      { id: 5, title: 'Post-Quake Check', content: 'Check injuries, avoid hazards (gas/electric), and follow official safety instructions.' },
    ],
  },
]
