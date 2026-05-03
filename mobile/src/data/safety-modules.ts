export type SafetyModuleRecord = {
  id: string
  title: string
  description: string
  category: string
  point: number
  videoUrl?: string
  quiz?: Array<{ question: string; options: string[]; answer: string }>
}

export const safetyModules: SafetyModuleRecord[] = [
  {
    id: '1',
    title: 'CPR Training',
    description: 'Learn life-saving cardiopulmonary resuscitation techniques.',
    category: 'First Aid',
    point: 3,
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    quiz: [
      {
        question: 'How deep should chest compressions be for adults?',
        options: ['1 inch', '2 inches', '3 inches', '4 inches'],
        answer: '2 inches',
      },
    ],
  },
  {
    id: '2',
    title: 'First Aid Basics',
    description: 'Essential first aid skills for common injuries and emergencies.',
    category: 'First Aid',
    point: 1,
    videoUrl: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
  },
  {
    id: '3',
    title: 'Earthquake Safety',
    description: 'What to do before, during, and after an earthquake.',
    category: 'Emergency',
    point: 2,
    videoUrl: 'https://www.youtube.com/watch?v=3JZ_D3ELwOQ',
  },
]
