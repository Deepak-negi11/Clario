import { test , expect , describe} from "bun:test";
import { SignupSchema,SigninSchema } from "./auth.schema";
import { password } from "bun";


describe("Authentication",()=>{
    test("accepts valid signup input" , ()=>{
        const input = {
            email :"deepak@test.com",
            password:"password123",
            username:"deepak",
        };
        const result =  SignupSchema.safeParse(input);
        expect(result.success).toBe(true);
    })
    test("reject the invalid email first",()=>{
        const input = {
            email:"not-an-email",
            password:"password123",
            username:"deepak"
        }
        const result = SignupSchema.safeParse(input);
        expect(result.success).toBe(false)
    })
    test("reject the short password",()=>{
        const input = {
            email:"deepak@test.com",
            password:"short",
            username:"deepak"
        }
        const result = SignupSchema.safeParse(input);
        expect(result.success).toBe(false)

    })
     test("rejects empty name", () => {
      const input = {
        email: "deepak@test.com",
        password: "password123",
        username: "",
      };
      const result = SignupSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
    test("accept the valid signin input",()=>{
        const input = {
            email:"deepak@test.com",
            password:"password123"
        }
        const result = SigninSchema.safeParse(input);
        expect(result.success).toBe(true)
    })
    test("reject the invalid email",()=>{
        const input = {
            email:"deepak-negi",
            password:"password123"
        };
        const result = SigninSchema.safeParse(input);
        expect(result.success).toBe(false)
    });
    test("reject the invalid password",()=>{
        const input = {
            email:"deepak@test.com",
            password:"short"

        };
        const result = SigninSchema.safeParse(input);
        expect(result.success).toBe(false)
    })
})