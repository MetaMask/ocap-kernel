import demo01 from './01-vat-creation/run.ts';

type Demo = (args: string[]) => Promise<unknown>;

const demos: Demo[] = [
  async () => {
    throw new Error('DEMO 00: Not Implemented');
  },
  demo01, // vat-creation
];

export default demos;
