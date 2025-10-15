import { describe, it, expect, beforeEach } from 'vitest';
import { makeStreamValidator, InvalidSyntax } from './parser.ts';

describe('StreamValidator', () => {
  let validator: ReturnType<typeof makeStreamValidator>;

  beforeEach(() => {
    validator = makeStreamValidator();
  });

  describe('complete statements', () => {
    it('should return complete variable declaration', () => {
      const result = validator('let x = 10;');
      expect(result).toBe('let x = 10;');
    });

    it('should return complete expression statement', () => {
      const result = validator('console.log("hello");');
      expect(result).toBe('console.log("hello");');
    });

    it('should return complete function declaration', () => {
      const result = validator('function test() { return 42; }');
      expect(result).toBe('function test() { return 42; }');
    });

    it('should handle multiple statements and return first complete one', () => {
      const result = validator('let x = 10; let y = 20;');
      expect(result).toBe('let x = 10;');
    });

    it('should handle partial input followed by complete statement', () => {
      let result = validator('let x = ');
      expect(result).toBeNull();
      
      result = validator('10;');
      expect(result).toBe('let x = 10;');
    });
  });

  describe('irrecoverable syntax errors', () => {
    it('should throw InvalidSyntax for incomplete variable declaration', () => {
      expect(() => {
        validator('let x = ;');
      }).toThrow(InvalidSyntax);
    });

    it('should throw InvalidSyntax for invalid syntax', () => {
      expect(() => {
        validator('let x = ; let y = 10;');
      }).toThrow(InvalidSyntax);
    });

    it('should throw InvalidSyntax for malformed code', () => {
      expect(() => {
        validator('let x = ; let y = 10;');
      }).toThrow(InvalidSyntax);
    });

    it('should throw InvalidSyntax for invalid operators', () => {
      expect(() => {
        validator('let x = ;');
      }).toThrow(InvalidSyntax);
    });
  });

  describe('incomplete but valid code', () => {
    it('should return null for incomplete variable declaration', () => {
      const result = validator('let x = ');
      expect(result).toBeNull();
    });

    it('should return null for incomplete expression', () => {
      const result = validator('console.log(');
      expect(result).toBeNull();
    });

    it('should return null for incomplete function', () => {
      const result = validator('function test() {');
      expect(result).toBeNull();
    });

    it('should return null for incomplete object literal', () => {
      const result = validator('const obj = {');
      expect(result).toBeNull();
    });

    it('should return null for incomplete array', () => {
      const result = validator('const arr = [');
      expect(result).toBeNull();
    });
  });

  describe('stream processing', () => {
    it('should handle incremental input correctly', () => {
      // Step 1: Incomplete
      let result = validator('let x = ');
      expect(result).toBeNull();
      
      // Step 2: Still incomplete
      result = validator('10');
      expect(result).toBeNull();
      
      // Step 3: Complete
      result = validator(';');
      expect(result).toBe('let x = 10;');
    });

    it('should handle multiple statements in stream', () => {
      // Should return first complete statement only
      const result = validator('let x = 10; let y = 20;');
      expect(result).toBe('let x = 10;');
    });

    it('should handle mixed complete and incomplete statements', () => {
      // Should return first complete statement only
      const result = validator('let x = 10; let y = ');
      expect(result).toBe('let x = 10;');
    });

    it('handles mixed input and errors', () => {
      const result = validator('let x = 10; let y = ;');
      expect(result).toBe('let x = 10;');
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      const result = validator('');
      expect(result).toBeNull();
    });

    it('should handle whitespace only', () => {
      const result = validator('   \n\t  ');
      expect(result).toBeNull();
    });

    it('should handle comments', () => {
      const result = validator('// This is a comment\nlet x = 10;');
      expect(result).toBe('let x = 10;');
    });

    it('should handle multiline statements', () => {
      const result = validator('let x = 10;\nlet y = 20;');
      expect(result).toBe('let x = 10;');
    });

    it('should handle complex expressions', () => {
      const result = validator('const result = (a + b) * c;');
      expect(result).toBe('const result = (a + b) * c;');
    });
  });

  describe('specific examples from requirements', () => {
    it('should throw InvalidSyntax for "let x = ;"', () => {
      expect(() => {
        validator('let x = ;');
      }).toThrow(InvalidSyntax);
    });

    it('should return "let x = 10;" when stream goes from "let x = " to "let x = 10; let"', () => {
      // Simulate the exact scenario mentioned
      let result = validator('let x = ');
      expect(result).toBeNull();
      
      result = validator('10; let');
      expect(result).toBe('let x = 10;');
    });

    it('should handle the exact example: "let x = " then "10; let"', () => {
      const validator1 = makeStreamValidator();
      let result = validator1('let x = ');
      expect(result).toBeNull();
      
      result = validator1('10; let');
      expect(result).toBe('let x = 10;');
    });
  });

  describe('error message validation', () => {
    it('should include meaningful error message for InvalidSyntax', () => {
      expect(() => validator('let x = ;')).toThrow(InvalidSyntax);
    });
  });

  describe('buffer management', () => {
    it('should accumulate input until complete statement is found', () => {
      // First chunk - incomplete
      let result = validator('let x = ');
      expect(result).toBeNull();
      
      // Second chunk - still incomplete  
      result = validator('10');
      expect(result).toBeNull();
      
      // Third chunk - now complete
      result = validator(';');
      expect(result).toBe('let x = 10;');
    });

    it('should maintain buffer for incomplete statements', () => {
      validator('let x = ');
      validator('10');
      const result = validator(';');
      expect(result).toBe('let x = 10;');
    });
  });
});
