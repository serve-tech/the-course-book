export function Brand() {
  return (
    <header>
      <div className="brand">
        <div className="mark bookmark" aria-label="The Course Book">
          <svg
            viewBox="0 0 96 76"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <g
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d="M8 42c13-4.3 25.4-1.7 40 7v20c-14.6-8.7-27-11.3-40-7Z"
                strokeWidth="2.8"
              />
              <path
                d="M88 42c-13-4.3-25.4-1.7-40 7v20c14.6-8.7 27-11.3 40-7Z"
                strokeWidth="2.8"
              />
              <path d="M48 49v20" strokeWidth="2.4" />
              <path
                d="M14 49c10-2.4 20-.2 29 4.7M82 49c-10-2.4-20-.2-29 4.7"
                strokeWidth="1.7"
              />
              <circle
                cx="48"
                cy="35"
                r="12.5"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="2"
              />
              <g stroke="#102b22" strokeWidth="1.6">
                <path d="M42 29.5l2 1.2M50 27.8l2 1.2M56 32l2 1.2M43 36l2 1.2M51 34l2 1.2M47 40l2 1.2M55 39l2 1.2" />
              </g>
            </g>
          </svg>
        </div>
        <b>
          The Course <span>Book</span>
        </b>
      </div>
    </header>
  );
}
