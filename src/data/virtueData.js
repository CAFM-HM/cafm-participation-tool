// ============================================================
// VIRTUE DEFINITIONS
// ============================================================
export const VIRTUES = [
  { key: 'discipline', label: 'Discipline', color: '#1B3A5C', bg: '#E8EEF4' },
  { key: 'attention',  label: 'Attention',  color: '#8B5E3C', bg: '#F5EDE4' },
  { key: 'charity',    label: 'Charity',    color: '#2E7D5B', bg: '#E4F2EB' },
  { key: 'inquiry',    label: 'Inquiry',    color: '#7B2D8B', bg: '#F2E6F6' },
];

export const HOUSES = ['Augustine', 'Athanasius', 'Chrysostom', 'Ambrose'];

// ============================================================
// RUBRIC LEGEND (for ? modals)
// ============================================================
export const LEGEND = {
  discipline: {
    5: { label: 'Exemplary', desc: 'Consistently prepared, materials organized, assignments complete, self-disciplined without reminders.' },
    4: { label: 'Proficient', desc: 'Usually prepared and organized. Rarely needs reminders about materials or deadlines.' },
    3: { label: 'Developing', desc: 'Sometimes prepared, occasionally missing materials or assignments. Needs periodic reminders.' },
    2: { label: 'Emerging', desc: 'Frequently unprepared. Often missing materials or assignments despite reminders.' },
    1: { label: 'Beginning', desc: 'Consistently unprepared. Rarely has materials or completed work.' },
  },
  attention: {
    5: { label: 'Exemplary', desc: 'Fully present and tracking with instruction at all times. Actively listening and mentally engaged.' },
    4: { label: 'Proficient', desc: 'Generally attentive and present. Brief lapses are self-corrected quickly.' },
    3: { label: 'Developing', desc: 'Attentive at times but drifts. Needs occasional redirection to stay with instruction.' },
    2: { label: 'Emerging', desc: 'Frequently inattentive. Often needs redirection and struggles to stay mentally present.' },
    1: { label: 'Beginning', desc: 'Consistently inattentive. Does not track with instruction despite repeated redirection.' },
  },
  charity: {
    5: { label: 'Exemplary', desc: 'A positive force in the classroom. Builds others up, treats everyone with genuine kindness and respect.' },
    4: { label: 'Proficient', desc: 'Kind and respectful to classmates. Contributes positively to classroom culture.' },
    3: { label: 'Developing', desc: 'Generally respectful but occasionally indifferent to others. Neutral presence in the room.' },
    2: { label: 'Emerging', desc: 'Sometimes disrespectful or dismissive of classmates. Negative impact on classroom culture at times.' },
    1: { label: 'Beginning', desc: 'Frequently unkind or disruptive to others. Significantly harms classroom culture.' },
  },
  inquiry: {
    5: { label: 'Exemplary', desc: 'Asks deep, thoughtful questions. Takes intellectual risks. Shows genuine curiosity and wonder.' },
    4: { label: 'Proficient', desc: 'Asks good questions and engages with material beyond the surface. Willing to take risks.' },
    3: { label: 'Developing', desc: 'Occasionally asks questions or shows curiosity. Engages at a surface level with the material.' },
    2: { label: 'Emerging', desc: 'Rarely asks questions. Shows little curiosity or initiative beyond the minimum required.' },
    1: { label: 'Beginning', desc: 'No questions, no curiosity. Does not engage with material at any level of depth.' },
  },
};

// ============================================================
// NARRATIVE SENTENCES — Tightened Virtue Boundaries
// Discipline = preparation, materials, punctuality, self-control
// Attention  = listening, tracking, mental presence
// Charity    = treatment of others, impact on classroom culture
// Inquiry    = questions, curiosity, intellectual risk, depth
// ============================================================
export const VIRTUE_SENTENCES = {
  discipline: {
    5: {
      he: [
        "He arrives each day fully prepared, with all materials organized and assignments completed ahead of time.",
        "He demonstrates exceptional self-discipline, consistently meeting every deadline without reminders."
      ],
      she: [
        "She arrives each day fully prepared, with all materials organized and assignments completed ahead of time.",
        "She demonstrates exceptional self-discipline, consistently meeting every deadline without reminders."
      ]
    },
    4: {
      he: [
        "He is reliably prepared for class and rarely needs reminders about materials or deadlines.",
        "He shows strong self-discipline and comes to class organized and ready to work."
      ],
      she: [
        "She is reliably prepared for class and rarely needs reminders about materials or deadlines.",
        "She shows strong self-discipline and comes to class organized and ready to work."
      ]
    },
    3: {
      he: [
        "He is sometimes prepared but occasionally arrives without necessary materials or incomplete assignments.",
        "He shows developing self-discipline, though he still needs periodic reminders about preparation."
      ],
      she: [
        "She is sometimes prepared but occasionally arrives without necessary materials or incomplete assignments.",
        "She shows developing self-discipline, though she still needs periodic reminders about preparation."
      ]
    },
    2: {
      he: [
        "He frequently arrives unprepared, often missing materials or assignments despite reminders.",
        "He struggles with self-discipline around preparation and regularly needs redirection to get organized."
      ],
      she: [
        "She frequently arrives unprepared, often missing materials or assignments despite reminders.",
        "She struggles with self-discipline around preparation and regularly needs redirection to get organized."
      ]
    },
    1: {
      he: [
        "He consistently arrives unprepared and rarely has necessary materials or completed work.",
        "He has not demonstrated the self-discipline needed to meet basic preparation expectations."
      ],
      she: [
        "She consistently arrives unprepared and rarely has necessary materials or completed work.",
        "She has not demonstrated the self-discipline needed to meet basic preparation expectations."
      ]
    }
  },
  attention: {
    5: {
      he: [
        "He is fully present during instruction, actively listening and tracking with the lesson at all times.",
        "He gives his complete mental attention to class and is consistently one of the most attentive students in the room."
      ],
      she: [
        "She is fully present during instruction, actively listening and tracking with the lesson at all times.",
        "She gives her complete mental attention to class and is consistently one of the most attentive students in the room."
      ]
    },
    4: {
      he: [
        "He is generally attentive and present during instruction, with only brief lapses that he corrects on his own.",
        "He listens well and stays mentally engaged with the lesson for the majority of class time."
      ],
      she: [
        "She is generally attentive and present during instruction, with only brief lapses that she corrects on her own.",
        "She listens well and stays mentally engaged with the lesson for the majority of class time."
      ]
    },
    3: {
      he: [
        "He is attentive at times but tends to drift, requiring occasional redirection to stay with the lesson.",
        "He shows inconsistent attention — present and tracking some days, mentally elsewhere on others."
      ],
      she: [
        "She is attentive at times but tends to drift, requiring occasional redirection to stay with the lesson.",
        "She shows inconsistent attention — present and tracking some days, mentally elsewhere on others."
      ]
    },
    2: {
      he: [
        "He is frequently inattentive and needs regular redirection to stay mentally present during instruction.",
        "He struggles to maintain attention and often appears mentally disengaged from the lesson."
      ],
      she: [
        "She is frequently inattentive and needs regular redirection to stay mentally present during instruction.",
        "She struggles to maintain attention and often appears mentally disengaged from the lesson."
      ]
    },
    1: {
      he: [
        "He does not track with instruction and remains mentally disengaged despite repeated redirection.",
        "He shows no evidence of listening or attending to the lesson on a consistent basis."
      ],
      she: [
        "She does not track with instruction and remains mentally disengaged despite repeated redirection.",
        "She shows no evidence of listening or attending to the lesson on a consistent basis."
      ]
    }
  },
  charity: {
    5: {
      he: [
        "He is a genuinely positive presence in the classroom, consistently building others up and treating everyone with kindness.",
        "He contributes meaningfully to classroom culture through his kindness, patience, and respect for every classmate."
      ],
      she: [
        "She is a genuinely positive presence in the classroom, consistently building others up and treating everyone with kindness.",
        "She contributes meaningfully to classroom culture through her kindness, patience, and respect for every classmate."
      ]
    },
    4: {
      he: [
        "He is kind and respectful to his classmates and contributes positively to the classroom environment.",
        "He treats others well and is a reliable, positive member of the classroom community."
      ],
      she: [
        "She is kind and respectful to her classmates and contributes positively to the classroom environment.",
        "She treats others well and is a reliable, positive member of the classroom community."
      ]
    },
    3: {
      he: [
        "He is generally respectful but can be indifferent to his classmates at times, maintaining a neutral presence.",
        "He does not cause problems with others but has not yet become a positive force in the classroom community."
      ],
      she: [
        "She is generally respectful but can be indifferent to her classmates at times, maintaining a neutral presence.",
        "She does not cause problems with others but has not yet become a positive force in the classroom community."
      ]
    },
    2: {
      he: [
        "He is sometimes dismissive or unkind toward classmates, which negatively affects the classroom environment.",
        "He needs to grow in his treatment of others, as his interactions can be hurtful or disrespectful at times."
      ],
      she: [
        "She is sometimes dismissive or unkind toward classmates, which negatively affects the classroom environment.",
        "She needs to grow in her treatment of others, as her interactions can be hurtful or disrespectful at times."
      ]
    },
    1: {
      he: [
        "He is frequently unkind or disruptive toward others, significantly harming the classroom community.",
        "He has not shown the respect for others that is expected and his behavior is a serious concern."
      ],
      she: [
        "She is frequently unkind or disruptive toward others, significantly harming the classroom community.",
        "She has not shown the respect for others that is expected and her behavior is a serious concern."
      ]
    }
  },
  inquiry: {
    5: {
      he: [
        "He asks deep, thoughtful questions that enrich class discussion and demonstrate genuine intellectual curiosity.",
        "He consistently takes intellectual risks, pursuing ideas with wonder and a desire to understand at the deepest level."
      ],
      she: [
        "She asks deep, thoughtful questions that enrich class discussion and demonstrate genuine intellectual curiosity.",
        "She consistently takes intellectual risks, pursuing ideas with wonder and a desire to understand at the deepest level."
      ]
    },
    4: {
      he: [
        "He asks good questions and engages with the material beyond the surface, showing a willingness to think deeply.",
        "He demonstrates solid intellectual curiosity and is willing to take risks in pursuing understanding."
      ],
      she: [
        "She asks good questions and engages with the material beyond the surface, showing a willingness to think deeply.",
        "She demonstrates solid intellectual curiosity and is willing to take risks in pursuing understanding."
      ]
    },
    3: {
      he: [
        "He occasionally asks questions and shows curiosity, though his engagement with the material tends to stay at the surface.",
        "He participates in discussion when prompted but rarely pursues deeper understanding on his own initiative."
      ],
      she: [
        "She occasionally asks questions and shows curiosity, though her engagement with the material tends to stay at the surface.",
        "She participates in discussion when prompted but rarely pursues deeper understanding on her own initiative."
      ]
    },
    2: {
      he: [
        "He rarely asks questions or shows curiosity and tends to do the minimum required.",
        "He shows little initiative in engaging with the material and has not responded to invitations to go deeper."
      ],
      she: [
        "She rarely asks questions or shows curiosity and tends to do the minimum required.",
        "She shows little initiative in engaging with the material and has not responded to invitations to go deeper."
      ]
    },
    1: {
      he: [
        "He shows no interest in engaging with the material at any level of depth.",
        "He refuses to participate intellectually and has not responded to repeated invitations to engage."
      ],
      she: [
        "She shows no interest in engaging with the material at any level of depth.",
        "She refuses to participate intellectually and has not responded to repeated invitations to engage."
      ]
    }
  }
};

// ============================================================
// BRIDGING SENTENCES — for common contradictory score pairings
// ============================================================
export const BRIDGES = {
  // High Discipline / Low Attention
  'discipline_high_attention_low': {
    he: "While he arrives prepared and organized, he struggles to maintain that focus once instruction begins.",
    she: "While she arrives prepared and organized, she struggles to maintain that focus once instruction begins."
  },
  // Low Discipline / High Attention
  'discipline_low_attention_high': {
    he: "Although he often arrives unprepared, once class begins he is surprisingly attentive and engaged with the lesson.",
    she: "Although she often arrives unprepared, once class begins she is surprisingly attentive and engaged with the lesson."
  },
  // High Charity / Low Inquiry
  'charity_high_inquiry_low': {
    he: "His kindness toward classmates is genuine, and channeling that same energy into intellectual curiosity would serve him well.",
    she: "Her kindness toward classmates is genuine, and channeling that same energy into intellectual curiosity would serve her well."
  },
  // High Inquiry / Low Charity
  'inquiry_high_charity_low': {
    he: "His intellectual engagement is strong, but he would benefit from extending that same thoughtfulness to how he treats his classmates.",
    she: "Her intellectual engagement is strong, but she would benefit from extending that same thoughtfulness to how she treats her classmates."
  },
};

// Detect if bridging is needed (gap of 3+ between two virtue scores)
export function getBridgingSentences(scores, pronoun) {
  const bridges = [];
  const d = scores.discipline;
  const a = scores.attention;
  const c = scores.charity;
  const i = scores.inquiry;

  if (d !== null && a !== null) {
    if (d >= 4 && a <= 2) bridges.push(BRIDGES['discipline_high_attention_low'][pronoun]);
    if (d <= 2 && a >= 4) bridges.push(BRIDGES['discipline_low_attention_high'][pronoun]);
  }
  if (c !== null && i !== null) {
    if (c >= 4 && i <= 2) bridges.push(BRIDGES['charity_high_inquiry_low'][pronoun]);
    if (i >= 4 && c <= 2) bridges.push(BRIDGES['inquiry_high_charity_low'][pronoun]);
  }

  return bridges;
}

// ============================================================
// OPENING & CLOSING SENTENCES
// ============================================================
export const OPENINGS = {
  5: [
    "[S] has been an outstanding participant in [C] this quarter.",
    "[S] has demonstrated exceptional engagement and character in [C] this quarter."
  ],
  4: [
    "[S] has been a strong participant in [C] this quarter.",
    "[S] has shown commendable effort and growth in [C] this quarter."
  ],
  3: [
    "[S] has shown moderate participation in [C] this quarter.",
    "[S] has had an uneven but developing quarter in [C]."
  ],
  2: [
    "[S] has struggled with consistent participation in [C] this quarter.",
    "[S] has had a difficult quarter in [C] and has significant room for growth."
  ],
  1: [
    "[S] has not met participation expectations in [C] this quarter.",
    "[S] requires immediate and sustained improvement in [C]."
  ],
};

export const CLOSINGS = {
  5: {
    he: [
      "He is a model student and a joy to have in class.",
      "His consistent excellence sets the standard for his peers."
    ],
    she: [
      "She is a model student and a joy to have in class.",
      "Her consistent excellence sets the standard for her peers."
    ],
    n: [
      "Keep up this outstanding work."
    ]
  },
  4: {
    he: [
      "He is on the right track and should continue building on these strengths.",
      "With continued effort, he has the potential to truly excel."
    ],
    she: [
      "She is on the right track and should continue building on these strengths.",
      "With continued effort, she has the potential to truly excel."
    ],
    n: []
  },
  3: {
    he: [
      "He has the ability to do better and I look forward to seeing growth next quarter.",
      "With more consistent effort, he can reach his potential."
    ],
    she: [
      "She has the ability to do better and I look forward to seeing growth next quarter.",
      "With more consistent effort, she can reach her potential."
    ],
    n: []
  },
  2: {
    he: [
      "He needs to make significant changes to meet expectations going forward.",
      "I am concerned about his trajectory and encourage a conversation about how to improve."
    ],
    she: [
      "She needs to make significant changes to meet expectations going forward.",
      "I am concerned about her trajectory and encourage a conversation about how to improve."
    ],
    n: []
  },
  1: {
    he: [
      "He must make immediate and sustained improvement. A parent conference is recommended.",
      "His current trajectory is unsustainable and requires urgent attention."
    ],
    she: [
      "She must make immediate and sustained improvement. A parent conference is recommended.",
      "Her current trajectory is unsustainable and requires urgent attention."
    ],
    n: []
  },
};

// Build full narrative from student selections
export function buildNarrative(student, teacherName, className, quarter) {
  const { name, pronoun, scores, sentenceSelections, openingIndex, closingIndex } = student;
  
  // Check completeness
  const overallScore = Math.round(
    VIRTUES.reduce((sum, v) => sum + (scores[v.key] || 0), 0) / VIRTUES.length
  );
  
  if (!overallScore || openingIndex === null || closingIndex === null) return null;
  for (const v of VIRTUES) {
    if (scores[v.key] === null || sentenceSelections[v.key] === null) return null;
  }

  const displayName = name || '[Student]';
  const displayClass = className || '[Class]';
  const pr = pronoun || 'he';

  // Opening
  const opening = (OPENINGS[overallScore]?.[openingIndex] || '')
    .replace('[S]', displayName)
    .replace('[C]', displayClass);

  // Virtue sentences
  const virtueParts = VIRTUES.map(v => {
    const score = scores[v.key];
    const idx = sentenceSelections[v.key];
    return VIRTUE_SENTENCES[v.key]?.[score]?.[pr]?.[idx] || '';
  });

  // Bridging sentences (inserted after virtue sentences)
  const bridges = getBridgingSentences(scores, pr);

  // Closing
  const closingOptions = [...(CLOSINGS[overallScore]?.[pr] || []), ...(CLOSINGS[overallScore]?.n || [])];
  const closing = closingOptions[closingIndex] || '';

  return [opening, ...virtueParts, ...bridges, closing].filter(Boolean).join(' ');
}
