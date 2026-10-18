import { useEffect, useRef, useState, type RefObject } from 'react';

/** True once the element has scrolled near the viewport. Without IntersectionObserver it is always true. */
export function useInView<Element extends HTMLElement>(margin = '200px'): [RefObject<Element | null>, boolean] {
  const ref = useRef<Element | null>(null);
  const [inView, setInView] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (inView || !element) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [inView, margin]);

  return [ref, inView];
}
