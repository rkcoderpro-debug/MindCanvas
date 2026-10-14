import type { SavedExam } from "@mindcanvas/shared";
import { examTotalPoints } from "@mindcanvas/shared";
import FormulaText from "./FormulaText";
export default function ExamPaper({ exam, answers = false, onReference }: { exam: SavedExam; answers?: boolean; onReference?: (sourceId: string, page: number | null) => void }) {
  const vi = exam.settings.language === "vi";
  let number = 0;
  return <article className={`exam-paper ${answers ? "exam-answer-paper" : ""}`}>
    <header><span>{exam.settings.subject} · {exam.settings.level}</span><h1>{answers ? (vi ? "Đáp án & lời giải" : "Answers & explanations") : exam.draft.title}</h1><p>{exam.blueprint.durationMinutes} {vi ? "phút" : "minutes"} · {examTotalPoints(exam.blueprint)} {vi ? "điểm" : "points"} · {({ easy: vi ? "Dễ" : "Easy", medium: vi ? "Vừa" : "Medium", hard: vi ? "Khó" : "Hard" })[exam.settings.difficulty]}</p>
      {!answers && <><p>{exam.draft.description}</p><p className="exam-student-line">{vi ? "Họ và tên: ____________________  Lớp: __________" : "Name: ____________________  Class: __________"}</p></>}
    </header>
    {exam.draft.sections.map(section => <section key={section.id}><h2>{section.title}</h2>{!answers && section.instructions && <p><FormulaText text={section.instructions}/></p>}
      {section.questions.map(question => { number++; const index = number; return <div className="exam-question" key={question.id}><h3>{vi ? "Câu" : "Question"} {index}. <span>({question.points} {vi ? "điểm" : "points"})</span></h3>
        <p><FormulaText text={question.prompt}/></p>
        {!answers && <>{question.options.length > 0 && <ol className="exam-options" type="A">{question.options.map((option, index) => <li key={index}><FormulaText text={option}/></li>)}</ol>}
          {question.type !== "mcq" && <div className={`exam-writing-space ${question.type === "essay" ? "essay" : ""}`} aria-hidden="true"/>}</>}
        {answers && <><p><strong>{vi ? "Đáp án: " : "Answer: "}</strong>{question.correctIndex !== null && `${String.fromCharCode(65 + question.correctIndex)}. `}<FormulaText text={question.answer}/></p><p><strong>{vi ? "Lời giải: " : "Explanation: "}</strong><FormulaText text={question.explanation}/></p>
          {question.rubric.length > 0 && <div className="exam-rubric"><strong>{vi ? "Hướng dẫn chấm" : "Marking guide"}</strong><ul>{question.rubric.map((item, index) => <li key={index}><FormulaText text={item.criterion}/> — {item.points} {vi ? "điểm" : "points"}</li>)}</ul></div>}
          <div className="exam-references">{question.references.map((reference, index) => { const source = exam.sources.find(source => source.id === reference.sourceId); const label = `${source?.name ?? reference.sourceId}${reference.page ? ` · ${vi ? "trang" : "page"} ${reference.page}` : ""}`; return <div key={index}>{onReference ? <button type="button" onClick={() => onReference(reference.sourceId, reference.page)}>{label}</button> : <strong>{label}</strong>}<blockquote>{reference.excerpt}</blockquote></div>; })}</div>
        </>}
      </div>; })}
    </section>)}
  </article>;
}
