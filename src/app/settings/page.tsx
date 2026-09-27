import { logout, updateSettings, updateSubject } from "../actions";
import SubmitButton from "@/components/SubmitButton";
import { loadCore } from "@/lib/data";
import { TIME_ZONES } from "@/lib/dates";

export default async function SettingsPage() {
  const core = await loadCore();
  const s = core.settings;

  return (
    <>
      <h1>Settings</h1>

      <section className="card">
        <h2>Where you live</h2>
        <p className="small muted">So your daily plan and dates switch over at your midnight.</p>
        <form action={updateSettings} className="row">
          <input type="hidden" name="back" value="/settings" />
          <select name="timeZone" defaultValue={s.timeZone} style={{ maxWidth: 320 }}>
            {TIME_ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
          <SubmitButton>Save</SubmitButton>
        </form>
      </section>

      <section className="card">
        <h2>Weekly hours</h2>
        <p className="small muted">
          The app switches to a heavy week automatically when any mock or final exam is within the number of weeks below.
          Extra hours go mostly to the subject with the nearest exam.
        </p>
        <form action={updateSettings} className="form-grid">
          <input type="hidden" name="back" value="/settings" />
          <label>
            Normal week: min hours
            <input type="number" name="normalHoursMin" min={1} step={0.5} defaultValue={s.normalHoursMin} />
          </label>
          <label>
            Normal week: max hours
            <input type="number" name="normalHoursMax" min={1} step={0.5} defaultValue={s.normalHoursMax} />
          </label>
          <label>
            Heavy week: min hours
            <input type="number" name="heavyHoursMin" min={1} step={0.5} defaultValue={s.heavyHoursMin} />
          </label>
          <label>
            Heavy week: max hours
            <input type="number" name="heavyHoursMax" min={1} step={0.5} defaultValue={s.heavyHoursMax} />
          </label>
          <label>
            Heavy weeks before an exam
            <input type="number" name="heavyWeeksBefore" min={1} max={8} defaultValue={s.heavyWeeksBefore} />
          </label>
          <div className="full">
            <SubmitButton>Save hours</SubmitButton>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Subjects &amp; targets</h2>
        <p className="small muted">Exam dates are on the Homework &amp; tests page. Grade boundaries are on each subject&apos;s page.</p>
        <ul className="list">
          {core.subjects.map((subject) => (
            <li key={subject.id}>
              <form action={updateSubject} className="form-grid grow">
                <input type="hidden" name="subjectId" value={subject.id} />
                <input type="hidden" name="back" value="/settings" />
                <strong className="full">{subject.name}</strong>
                <label>
                  Board
                  <input name="board" defaultValue={subject.board} />
                </label>
                <label>
                  Spec code
                  <input name="specCode" defaultValue={subject.specCode} />
                </label>
                <label>
                  Target grade
                  <input type="number" name="targetGrade" min={1} max={9} defaultValue={subject.targetGrade} />
                </label>
                <label>
                  Stretch grade (optional)
                  <input type="number" name="stretchGrade" min={1} max={9} defaultValue={subject.stretchGrade ?? ""} />
                </label>
                <div className="full">
                  <SubmitButton className="btn small ghost">Save {subject.name}</SubmitButton>
                </div>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>How the priorities work</h2>
        <p className="small dim">
          Every topic gets a score: <strong>marks weighting × weakness × urgency</strong>. Marks weighting is how much of the
          exam the topic is worth. Weakness is red 1, amber 0.6, green 0.25 (not rated 0.8). Urgency rises as that
          subject&apos;s next mock or exam gets closer. Topics that aren&apos;t due for review yet are held back, and a class test
          boosts the topics it covers. Today&apos;s plan takes the top scores, with no more than 2 topics from one subject.
        </p>
      </section>

      <form action={logout}>
        <button className="btn ghost">Log out</button>
      </form>
    </>
  );
}
