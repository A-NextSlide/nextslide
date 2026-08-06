import BrandWordmark from "@/components/common/BrandWordmark";

function NextSlideLogo({ size = 17.25 }: { size?: number }) {
  const scale = size / 18.95;

  return (
    <BrandWordmark
      tag="span"
      className="nextslide-logo"
      sizePx={size}
      textColor="#383636"
      xImageUrl="/brand/nextslide-x.png"
      ariaLabel="NextSlide"
      gapLeftPx={-3 * scale}
      gapRightPx={-8 * scale}
      liftPx={0}
      xLiftPx={-4 * scale}
      rightLiftPx={0}
    />
  );
}

function OpenAILogo() {
  return (
    <span className="openai-logo" role="img" aria-label="OpenAI">
      <svg className="openai-blossom" viewBox="146 227 268 265" aria-hidden="true">
        <path
          fill="currentColor"
          d="M249.176 323.434V298.276C249.176 296.158 249.971 294.569 251.825 293.509L302.406 264.381C309.29 260.409 317.5 258.555 325.973 258.555C357.75 258.555 377.877 283.185 377.877 309.399C377.877 311.253 377.877 313.371 377.611 315.49L325.178 284.771C322.001 282.919 318.822 282.919 315.645 284.771L249.176 323.434ZM367.283 421.415V361.301C367.283 357.592 365.694 354.945 362.516 353.092L296.048 314.43L317.763 301.982C319.617 300.925 321.206 300.925 323.058 301.982L373.639 331.112C388.205 339.586 398.003 357.592 398.003 375.069C398.003 395.195 386.087 413.733 367.283 421.412V421.415ZM233.553 368.452L211.838 355.742C209.986 354.684 209.19 353.095 209.19 350.975V292.718C209.19 264.383 230.905 242.932 260.301 242.932C271.423 242.932 281.748 246.641 290.49 253.26L238.321 283.449C235.146 285.303 233.555 287.951 233.555 291.659V368.455L233.553 368.452ZM280.292 395.462L249.176 377.985V340.913L280.292 323.436L311.407 340.913V377.985L280.292 395.462ZM300.286 475.968C289.163 475.968 278.837 472.259 270.097 465.64L322.264 435.449C325.441 433.597 327.03 430.949 327.03 427.239V350.445L349.011 363.155C350.865 364.213 351.66 365.802 351.66 367.922V426.179C351.66 454.514 329.679 475.965 300.286 475.965V475.968ZM237.525 416.915L186.944 387.785C172.378 379.31 162.582 361.305 162.582 343.827C162.582 323.436 174.763 305.164 193.563 297.485V357.861C193.563 361.571 195.154 364.217 198.33 366.071L264.535 404.467L242.82 416.915C240.967 417.972 239.377 417.972 237.525 416.915ZM234.614 460.343C204.689 460.343 182.71 437.833 182.71 410.028C182.71 407.91 182.976 405.792 183.238 403.672L235.405 433.863C238.582 435.715 241.763 435.715 244.938 433.863L311.407 395.466V420.622C311.407 422.742 310.612 424.331 308.758 425.389L258.179 454.519C251.293 458.491 243.083 460.343 234.611 460.343H234.614ZM300.286 491.854C332.329 491.854 359.073 469.082 365.167 438.892C394.825 431.211 413.892 403.406 413.892 375.073C413.892 356.535 405.948 338.529 391.648 325.552C392.972 319.991 393.766 314.43 393.766 308.87C393.766 271.003 363.048 242.666 327.562 242.666C320.413 242.666 313.528 243.723 306.644 246.109C294.725 234.457 278.307 227.042 260.301 227.042C228.258 227.042 201.513 249.815 195.42 280.004C165.761 287.685 146.694 315.49 146.694 343.824C146.694 362.362 154.638 380.368 168.938 393.344C167.613 398.906 166.819 404.467 166.819 410.027C166.819 447.894 197.538 476.231 233.024 476.231C240.172 476.231 247.058 475.173 253.943 472.788C265.859 484.441 282.278 491.854 300.286 491.854Z"
        />
      </svg>
      <svg className="openai-wordmark" viewBox="0 0 288 78" aria-hidden="true">
        <path
          fill="currentColor"
          d="M30.6.398C13.77.398 0 14.168 0 30.998s13.77 30.6 30.6 30.6 30.6-13.685 30.6-30.6S47.515.398 30.6.398m0 50.235c-10.455 0-18.87-8.585-18.87-19.635s8.415-19.635 18.87-19.635 18.87 8.585 18.87 19.635-8.415 19.635-18.87 19.635m61.54-33.235c-5.526 0-10.88 2.21-13.686 5.95v-5.1h-11.05v59.5h11.05V56.243c2.805 3.485 7.99 5.355 13.685 5.355 11.9 0 21.25-9.35 21.25-22.1s-9.35-22.1-21.25-22.1m-1.87 34.595c-6.29 0-11.9-4.93-11.9-12.495s5.61-12.495 11.9-12.495 11.899 4.93 11.899 12.495-5.61 12.495-11.9 12.495m49.133-34.595c-12.07 0-21.59 9.435-21.59 22.1s8.33 22.1 21.93 22.1c11.135 0 18.275-6.715 20.485-14.28h-10.795c-1.36 3.145-5.185 5.355-9.775 5.355-5.695 0-10.03-3.995-11.05-9.69h32.13v-4.335c0-11.56-8.075-21.25-21.335-21.25m-10.71 17.765c1.19-5.355 5.61-8.84 10.965-8.84 5.695 0 10.03 3.74 10.54 8.84zm61.454-17.765c-4.93 0-10.115 2.21-12.495 5.865v-5.015H166.6v42.5h11.05V37.883c0-6.63 3.57-10.965 9.35-10.965 5.355 0 8.245 4.08 8.245 9.775v24.055h11.05v-25.84c0-10.54-6.46-17.51-16.15-17.51M234.596 1.25l-24.055 59.5h11.815l5.1-13.005h27.37l5.1 13.005h11.985l-23.885-59.5zm-3.315 36.635 9.86-24.905 9.775 24.905zM287.636 1.25h-11.22v59.5h11.22z"
        />
      </svg>
    </span>
  );
}

function App() {
  return (
    <main className="page">
      <article className="announcement">
        <div className="brand-lockup" aria-label="NextSlide and OpenAI">
          <NextSlideLogo />
          <span className="lockup-divider" aria-hidden="true" />
          <OpenAILogo />
        </div>

        <h1>
          <span>NextSlide</span> is joining <em>OpenAI</em>
        </h1>

        <p className="lead">
          A note from Ahmed Beshry, founder of NextSlide.
        </p>

        <div className="note">
          <p>
            Presentations help ideas move through the world. They teach,
            persuade, share research, and move important work forward. But
            creating a great presentation has traditionally required hours of
            work, design experience, or both.
          </p>
          <p>
            We started NextSlide a little over a year ago with a simple belief:
            bringing an idea to life shouldn’t depend on your ability to design
            slides. We built a product that could turn prompts, notes,
            documents, or research into a polished, editable
            presentation—making it easier for anyone to share what they know.
          </p>
          <p>
            Our goal was never simply to generate slides faster. We wanted to
            make visual communication more accessible and help more people
            express their ideas clearly.
          </p>
          <p>
            The NextSlide team is now at OpenAI, helping build ChatGPT. We’re
            excited to continue pursuing that same mission: building AI
            products that help people create, communicate, and turn their ideas
            into meaningful work.
          </p>
          <p className="thanks">
            To everyone who created a deck, shared feedback, or supported us
            along the way: <strong>thank you for helping shape NextSlide.</strong>{" "}
            We’re grateful for the journey and excited for what comes next.
          </p>
        </div>

        <footer className="signoff">
          <span>Ahmed Beshry</span>
          <small>Founder, NextSlide</small>
        </footer>
      </article>
    </main>
  );
}

export default App;
