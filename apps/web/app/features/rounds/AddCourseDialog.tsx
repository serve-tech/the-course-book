import { useState } from "react";
import { Modal } from "../../shared/ui/Modal";
import { StateSelect } from "../../shared/ui/StateSelect";
import countries from "../../shared/data/countries.json";
import { replyMessage, useJournalFetcher } from "../journal/use-journal-fetcher";

/** Hand-enter a course that search cannot find; posts the add-course intent. */
export function AddCourseDialog({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState(""),
    [city, setCity] = useState(""),
    [state, setState] = useState(""),
    [country, setCountry] = useState(""),
    [rank, setRank] = useState("");
  const { busy, submit } = useJournalFetcher((reply) => {
    notify(replyMessage(reply));
    if (!reply.error) onClose();
  });
  const save = () => {
    if (busy) return;
    if (!name.trim()) {
      notify("Enter a course name");
      return;
    }
    if (!country) {
      notify("Select a country");
      return;
    }
    if (country === "USA" && !state) {
      notify("Select a state for a U.S. course");
      return;
    }
    submit({
      intent: "add-course",
      name: name.trim(),
      city: city.trim(),
      state,
      country,
      rank: rank.trim(),
    });
  };
  return (
    <Modal
      id="addmodal"
      title="Add a course"
      plainHeader
      eyebrow="Your course"
      onClose={onClose}
    >
      <div className="sub">Add anything that isn't in the pre-loaded lists.</div>
      <div className="group">
        <label htmlFor="newname">Course Name</label>
        <input
          id="newname"
          placeholder="Course name"
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </div>
      <div className="group">
        <label htmlFor="newloc">City — optional</label>
        <input
          id="newloc"
          placeholder="City"
          value={city}
          onChange={(event) => {
            setCity(event.target.value);
          }}
        />
      </div>
      <div className="group">
        <label id="newstateLabel" htmlFor="newstate">
          State — optional
        </label>
        <StateSelect
          id="newstate"
          includeDC
          value={state}
          onChange={(value) => {
            setState(value);
            if (value) setCountry("USA");
          }}
        />
      </div>
      <div className="group">
        <label htmlFor="newcountry">Country — required</label>
        <select
          id="newcountry"
          required
          value={country}
          onChange={(event) => {
            const value = event.target.value;
            setCountry(value);
            if (value !== "USA") setState("");
          }}
        >
          <option value="">Select a country…</option>
          {countries.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="group">
        <label htmlFor="newrank">Personal Rank — optional</label>
        <input
          id="newrank"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          placeholder="Leave blank for bottom"
          value={rank}
          onChange={(event) => {
            setRank(event.target.value);
          }}
        />
      </div>
      <div className="actions">
        <button className="secondary" id="addclose" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" id="save" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Add & Log Round"}
        </button>
      </div>
    </Modal>
  );
}
