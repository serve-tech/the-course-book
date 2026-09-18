import { useState } from "react";
import { useJournal, useServices } from "../../app/context";
import { courseSchema } from "../catalog/course";
import { Modal } from "../../shared/ui/Modal";
import { StateSelect } from "../../shared/ui/StateSelect";
import countries from "../../shared/data/countries.json";
import { AddRoundMode } from "./round-service";
import { errorMessage } from "../../shared/lib/errors";
export function AddCourseDialog({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { journal, rounds } = useServices(),
    { user, account } = useJournal();
  const [name, setName] = useState(""),
    [city, setCity] = useState(""),
    [state, setState] = useState(""),
    [country, setCountry] = useState(""),
    [rank, setRank] = useState(""),
    [busy, setBusy] = useState(false),
    [id] = useState(() => "custom-" + String(Date.now()));
  const save = async () => {
    if (busy) return;
    if (!user) {
      notify("Sign in before adding a course");
      return;
    }
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
    const requested =
      rank.trim() && Number.isFinite(Number(rank))
        ? Math.max(
            1,
            Math.min(account.myList.length + 1, Math.floor(Number(rank))),
          )
        : account.myList.length + 1;
    const course = courseSchema.parse({
      id,
      name: name.trim(),
      city: city.trim(),
      state,
      country,
      location:
        [city.trim(), state, country].filter(Boolean).join(", ") ||
        "Location not specified",
      region: country === "USA" ? "usa" : "international",
    });
    journal.remember(course);
    setBusy(true);
    try {
      await rounds.log(course, 1, AddRoundMode.Log, requested);
      onClose();
      notify("Course added at #" + String(requested));
    } catch (error) {
      notify(errorMessage(error));
      setBusy(false);
    }
  };
  return (
    <Modal
      id="addmodal"
      title="Add a course"
      plainHeader
      eyebrow="Your course"
      onClose={onClose}
    >
      <div className="sub">
        Add anything that isn't in the pre-loaded lists.
      </div>
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
        <button
          className="primary"
          id="save"
          disabled={busy}
          onClick={() => {
            void save();
          }}
        >
          {busy ? "Saving…" : "Add & Log Round"}
        </button>
      </div>
    </Modal>
  );
}
